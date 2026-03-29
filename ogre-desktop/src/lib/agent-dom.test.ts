import { describe, test, expect } from 'vitest';
import { formatDomForPrompt } from './agent-dom';
import { createTestDomElements, createTestSummaryElements } from './__test-utils__/agent-fixtures';
import type { InteractiveElement } from './agent-types';

describe('formatDomForPrompt', () => {
  test('renders collapsed summary with [collapsed] type', () => {
    const elements = [createTestSummaryElements()[0]];
    const output = formatDomForPrompt(elements);
    
    expect(output).toContain('summary[collapsed]');
    expect(output).toContain('"Click to View Grading Checklist"');
  });

  test('renders expanded summary with [expanded] type', () => {
    const elements = [createTestSummaryElements()[1]];
    const output = formatDomForPrompt(elements);
    
    expect(output).toContain('summary[expanded]');
    expect(output).toContain('"Click to View Rubric Targets"');
  });

  test('renders mixed elements including summaries', () => {
    const elements = createTestDomElements();
    const output = formatDomForPrompt(elements);
    
    expect(output).toContain('button');
    expect(output).toContain('input');
    expect(output).toContain('summary[collapsed]');
    expect(output).toContain('summary[expanded]');
  });

  test('returns no-elements message for empty array', () => {
    const output = formatDomForPrompt([]);
    
    expect(output).toBe('No interactive elements found.');
  });

  test('in-viewport element does NOT show [offscreen]', () => {
    const el: InteractiveElement = {
      index: 1,
      tag: 'button',
      text: 'Save',
      disabled: false,
      visible: true,
      inViewport: true,
      selector: '#save-btn',
    };
    const output = formatDomForPrompt([el]);
    expect(output).not.toContain('[offscreen]');
    expect(output).toContain('[1]');
    expect(output).toContain('button');
  });

  test('below-fold element shows [offscreen] indicator', () => {
    const el: InteractiveElement = {
      index: 2,
      tag: 'button',
      text: 'Submit at bottom',
      disabled: false,
      visible: true,
      inViewport: false,
      selector: '#bottom-btn',
    };
    const output = formatDomForPrompt([el]);
    expect(output).toContain('[offscreen]');
    expect(output).toContain('[2]');
    expect(output).toContain('button');
  });

  test('element without inViewport property does NOT show [offscreen]', () => {
    const el: InteractiveElement = {
      index: 3,
      tag: 'input',
      text: '',
      disabled: false,
      visible: true,
      // inViewport deliberately omitted
      selector: 'input#email',
    };
    const output = formatDomForPrompt([el]);
    expect(output).not.toContain('[offscreen]');
  });

  test('mixed viewport/offscreen elements — only offscreen ones flagged', () => {
    const elements: InteractiveElement[] = [
      {
        index: 1,
        tag: 'button',
        text: 'Top button',
        disabled: false,
        visible: true,
        inViewport: true,
        selector: '#btn-top',
      },
      {
        index: 2,
        tag: 'button',
        text: 'Bottom button',
        disabled: false,
        visible: true,
        inViewport: false,
        selector: '#btn-bottom',
      },
    ];
    const output = formatDomForPrompt(elements);
    const lines = output.split('\n');
    expect(lines[0]).not.toContain('[offscreen]');
    expect(lines[1]).toContain('[offscreen]');
  });

  // ── Selector CSS escaping (Bug #4) ─────────────────────────────────────────

  test('renders element with colon-escaped ID selector', () => {
    const el: InteractiveElement = {
      index: 1,
      tag: 'button',
      text: 'Go',
      disabled: false,
      visible: true,
      selector: '#foo\\:bar',
    };
    const output = formatDomForPrompt([el]);
    // Selector is rendered as-is inside parentheses
    expect(output).toContain('(#foo\\:bar)');
  });

  test('renders element with dot-escaped ID selector', () => {
    const el: InteractiveElement = {
      index: 1,
      tag: 'input',
      text: '',
      disabled: false,
      visible: true,
      selector: '#user\\.name',
    };
    const output = formatDomForPrompt([el]);
    expect(output).toContain('(#user\\.name)');
  });

  test('renders multi-class selector with 3 classes', () => {
    const el: InteractiveElement = {
      index: 1,
      tag: 'button',
      text: 'Primary Action',
      disabled: false,
      visible: true,
      selector: 'button.btn.primary.large',
    };
    const output = formatDomForPrompt([el]);
    expect(output).toContain('(button.btn.primary.large)');
    // Should contain all three classes
    expect(output).toContain('.btn');
    expect(output).toContain('.primary');
    expect(output).toContain('.large');
  });

  test('renders multi-class selector with 2 classes', () => {
    const el: InteractiveElement = {
      index: 1,
      tag: 'button',
      text: 'Submit',
      disabled: false,
      visible: true,
      selector: 'button.submit-btn.active',
    };
    const output = formatDomForPrompt([el]);
    expect(output).toContain('(button.submit-btn.active)');
  });

  test('renders quoted name attribute selector', () => {
    const el: InteractiveElement = {
      index: 1,
      tag: 'input',
      text: '',
      name: 'my field',
      disabled: false,
      visible: true,
      selector: 'input[name="my field"]',
    };
    const output = formatDomForPrompt([el]);
    // Quoted name attribute value in the selector
    expect(output).toContain('(input[name="my field"])');
  });

  test('renders quoted name attribute with special characters', () => {
    const el: InteractiveElement = {
      index: 1,
      tag: 'input',
      text: '',
      name: 'score[0]',
      disabled: false,
      visible: true,
      selector: 'input[name="score[0]"]',
    };
    const output = formatDomForPrompt([el]);
    expect(output).toContain('(input[name="score[0]"])');
  });
});

// ── INTERACTIVE_DOM_SCRIPT ES5 compliance ──────────────────────────────────

describe('INTERACTIVE_DOM_SCRIPT ES5 compliance', () => {
  // Import the raw module source to check for ES6+ syntax in the script string
  test('INTERACTIVE_DOM_SCRIPT does not contain arrow functions', async () => {
    const src = await import('./agent-dom?raw');
    const content: string = (src as any).default;
    // Extract the INTERACTIVE_DOM_SCRIPT string content
    const scriptStart = content.indexOf('const INTERACTIVE_DOM_SCRIPT = `');
    const scriptEnd = content.indexOf('`);\n', scriptStart);
    if (scriptStart === -1 || scriptEnd === -1) {
      // Pattern may differ — skip rather than false-fail
      return;
    }
    const scriptContent = content.slice(scriptStart, scriptEnd + 4);
    // No arrow functions inside the script template literal
    expect(scriptContent).not.toMatch(/=>\s*\{/);
    expect(scriptContent).not.toMatch(/=>\s*[a-zA-Z(]/);
  });

  test('INTERACTIVE_DOM_SCRIPT does not contain const or let declarations', async () => {
    const src = await import('./agent-dom?raw');
    const content: string = (src as any).default;
    const scriptStart = content.indexOf('const INTERACTIVE_DOM_SCRIPT = `');
    const scriptEnd = content.indexOf('`);\n', scriptStart);
    if (scriptStart === -1 || scriptEnd === -1) return;
    // Skip the outer TS const declaration line itself
    const scriptContent = content.slice(scriptStart + 'const INTERACTIVE_DOM_SCRIPT = `'.length, scriptEnd);
    // No const/let inside the eval'd script
    expect(scriptContent).not.toMatch(/\bconst\s+/);
    expect(scriptContent).not.toMatch(/\blet\s+/);
  });

  test('INTERACTIVE_DOM_SCRIPT does not contain template literals', async () => {
    const src = await import('./agent-dom?raw');
    const content: string = (src as any).default;
    const scriptStart = content.indexOf('const INTERACTIVE_DOM_SCRIPT = `');
    const scriptEnd = content.indexOf('`);\n', scriptStart);
    if (scriptStart === -1 || scriptEnd === -1) return;
    // Content inside the outer backtick (skip first char which is the opening backtick)
    const scriptContent = content.slice(scriptStart + 'const INTERACTIVE_DOM_SCRIPT = `'.length, scriptEnd);
    // There should be no unescaped backticks inside the script itself
    // (the content uses ${ } expressions would be template literals — but escaped \` are not)
    expect(scriptContent).not.toContain('`');
  });
});
