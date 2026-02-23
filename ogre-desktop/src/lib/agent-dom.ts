/**
 * agent-dom.ts - DOM snapshot module for the browser agent.
 * 
 * Captures only interactive elements from the webview for agent context.
 * This is used by the interactive-only agent mode.
 */

import { InteractiveElement } from './agent-types';
import { evalScriptJSON } from './browser';

// ============================================================================
// Inline DOM Extraction Script (runs in webview context)
// ============================================================================

/**
 * ES5-compatible script to extract interactive elements from the page.
 * This runs inside the webview via evalScriptJSON.
 */
const INTERACTIVE_DOM_SCRIPT = `(function() {
  var MAX_ELEMENTS = 200;
  var elements = [];
  
  // Query all interactive elements
  var selectors = [
    'button', 'a[href]', 'input', 'textarea', 'select',
    '[role="button"]', '[role="link"]', '[role="textbox"]',
    '[onclick]', '[contenteditable]'
  ];
  
  var nodes = document.querySelectorAll(selectors.join(', '));
  
  // Helper: generate CSS selector for an element
  function getSelector(el) {
    // Priority 1: id
    if (el.id) {
      return '#' + el.id.replace(/:/g, '\\\\:').replace(/\\./g, '\\\\.');
    }
    
    // Priority 2: name attribute
    if (el.name) {
      var tag = el.tagName.toLowerCase();
      return tag + '[name=' + el.name + ']';
    }
    
    // Priority 3: semantic attributes (data-testid, aria-label, data-id)
    var semanticAttrs = ['data-testid', 'aria-label', 'data-id', 'data-cy'];
    for (var i = 0; i < semanticAttrs.length; i++) {
      var attr = semanticAttrs[i];
      if (el.getAttribute(attr)) {
        var tag = el.tagName.toLowerCase();
        return tag + '[' + attr + '=' + el.getAttribute(attr) + ']';
      }
    }
    
    // Priority 4: tag + class
    if (el.className && typeof el.className === 'string' && el.className.trim()) {
      var tag = el.tagName.toLowerCase();
      var cls = el.className.trim().split(/\\s+/)[0];
      return tag + '.' + cls.replace(/\\./g, '\\\\.');
    }
    
    // Priority 5: nth-child fallback
    var parent = el.parentElement;
    if (parent) {
      var siblings = parent.querySelectorAll(el.tagName);
      for (var j = 0; j < siblings.length; j++) {
        if (siblings[j] === el) {
          var p = parent.tagName.toLowerCase();
          return p + '>' + el.tagName.toLowerCase() + ':nth-child(' + (j + 1) + ')';
        }
      }
    }
    
    // Fallback: tag only
    return el.tagName.toLowerCase();
  }
  
  // Helper: check if element is visible
  function isVisible(el) {
    var style = window.getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;
    
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    
    // Check if element is in viewport
    var viewWidth = window.innerWidth || document.documentElement.clientWidth;
    var viewHeight = window.innerHeight || document.documentElement.clientHeight;
    
    if (rect.right < 0 || rect.bottom < 0) return false;
    if (rect.left > viewWidth || rect.top > viewHeight) return false;
    
    return true;
  }
  
  // Helper: get text content (trimmed)
  function getText(el) {
    return (el.textContent || el.innerText || '').trim().substring(0, 100);
  }
  
  // Process each element
  for (var idx = 0; idx < nodes.length && elements.length < MAX_ELEMENTS; idx++) {
    var el = nodes[idx];
    
    if (!isVisible(el)) continue;
    
    var tag = el.tagName.toLowerCase();
    var interactive = {
      index: elements.length + 1,
      tag: tag,
      type: el.type || undefined,
      id: el.id || undefined,
      name: el.name || undefined,
      placeholder: el.placeholder || undefined,
      text: getText(el),
      value: el.value !== undefined && el.value !== '' ? el.value : undefined,
      href: el.href || undefined,
      disabled: el.disabled || false,
      visible: true,
      selector: getSelector(el)
    };
    
    elements.push(interactive);
  }
  
  return elements;
})()`;

// ============================================================================
// Public API
// ============================================================================

/**
 * Capture interactive DOM elements from the embedded webview.
 * Returns only visible, interactive elements (buttons, links, inputs, etc.)
 * capped at 200 elements maximum.
 * 
 * @returns Promise resolving to array of InteractiveElement objects
 */
export async function captureInteractiveDom(): Promise<InteractiveElement[]> {
  const elements = await evalScriptJSON<InteractiveElement[]>(INTERACTIVE_DOM_SCRIPT);
  return elements;
}

/**
 * Format interactive elements for inclusion in an LLM prompt.
 * Each element is formatted as a single line with index, tag, and selector.
 * 
 * @param elements - Array of InteractiveElement objects
 * @returns Formatted string with one element per line
 * 
 * @example
 * [1] button "Sign In" (#login-btn)
 * [2] input[email] placeholder="Enter email" (input[name=email])
 */
export function formatDomForPrompt(elements: InteractiveElement[]): string {
  if (!elements || elements.length === 0) {
    return 'No interactive elements found.';
  }
  
  return elements.map(el => {
    const parts: string[] = [];
    
    // Index and tag
    parts.push(`[${el.index}]`);
    parts.push(el.tag);
    
    // Type if present (for inputs)
    if (el.type && el.type !== 'text') {
      parts[parts.length - 1] += `[${el.type}]`;
    }
    
    // Text content in quotes
    if (el.text) {
      parts.push(`"${el.text}"`);
    }
    
    // Placeholder
    if (el.placeholder) {
      parts.push(`placeholder="${el.placeholder}"`);
    }
    
    // Selector in parentheses
    if (el.selector) {
      parts.push(`(${el.selector})`);
    }
    
    return parts.join(' ');
  }).join('\n');
}
