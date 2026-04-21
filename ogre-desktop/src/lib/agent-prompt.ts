/**
 * agent-prompt.ts — Structured tool metadata for the runtime harness.
 *
 * Exports the ToolDefinition interface and TOOL_DEFINITIONS array — the 16
 * actions the browser agent can invoke. System prompt assembly has moved to
 * runtime-harness.ts (buildHarness / captureHarnessContext).
 */

// ============================================================================
// Tool Definitions
// ============================================================================

/** Describes a single tool available to the browser agent. */
export interface ToolDefinition {
  name: string;
  description: string;
  params: Record<string, string>; // param name → description
}

/** All 16 tools the browser agent can invoke. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'click',
    description: 'Click an element on the page',
    params: { selector: 'CSS selector of the element to click' }
  },
  {
    name: 'triple_click',
    description: 'Triple-click an element to select all its text (useful before overwriting)',
    params: { selector: 'CSS selector of the element to triple-click' }
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
    description: 'Scroll the page by a fixed pixel amount',
    params: {
      direction: '"up", "down", "left", or "right"',
      amount: 'Pixels to scroll (number)'
    }
  },
  {
    name: 'scrollIntoView',
    description: 'Scroll a specific element into view by matching its visible text content. More reliable than scroll when targeting a named element (student name, section heading, label).',
    params: {
      text: 'Text content of the element to scroll into view (e.g. student name, section heading)'
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
  },
  {
    name: 'writeCodeMirror',
    description: 'Write content into a CodeMirror editor (e.g. the MOM question editor Common Control or Question Text fields). Does NOT require runJS approval.',
    params: {
      selector: 'CSS selector of the underlying textarea or .CodeMirror container. For MOM: "#control" (Common Control) or "#qtext" (Question Text).',
      value: 'Full text to write — replaces existing content. PHP/math code is safe; no escaping needed.'
    }
  },
  {
    name: 'capturePopup',
    description: 'Capture a screenshot of a popup window that just opened (e.g. after clicking MOM "Quick Save and Preview"). Returns a screenshot data URL.',
    params: {
      timeoutMs: '(optional) Max ms to wait for the popup to appear. Default 8000, max 15000.'
    }
  },
  {
    name: 'discover_page',
    description: 'Run AI-powered page structure discovery on the current page. Analyzes the DOM and screenshot to identify CSS selectors for student sections, score inputs, feedback areas, etc.',
    params: {
      hints: '(optional) Discovery hints object with fields like estimatedStudentCount, knownSelectors, pageDescription'
    }
  },
  {
    name: 'test_profile',
    description: 'Test a saved site profile against the currently loaded page. Verifies each CSS selector finds matching elements and simulates data extraction.',
    params: {
      profileId: 'ID of the site profile to test (e.g. "myopenmath", "canvas-speedgrader")',
      sampleCount: '(optional) Number of sample elements to check'
    }
  },
  {
    name: 'save_profile',
    description: 'Save a new or updated site profile with CSS selectors for a grading page. Requires a non-empty name and at least one selector.',
    params: {
      profile: 'Partial SiteProfile object with selectors, urlPatterns, feedback, save, and navigation config',
      name: 'Human-readable name for the profile (e.g. "My Canvas Course")'
    }
  },
];

