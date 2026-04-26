/**
 * interaction-tester.ts — Run a non-destructive click → type → read sequence
 * against a grading page to prove that proposed selectors map to working form
 * fields.
 *
 * Injects a visible cursor overlay so the user can watch the AI "perform" in
 * the embedded browser. Never clicks the save button (would persist test data).
 * Captures original state before each write and restores it after the read,
 * so the page state is unchanged when the test finishes.
 *
 * All DOM manipulation runs as IIFEs via evalScriptJSON — one call per logical
 * step so cursor animations have time to render between each.
 */

import { evalScriptJSON } from './browser';

// ── Types ────────────────────────────────────────────────────────────────────

export interface InteractionTestSelectors {
  scoreInput?: string;
  feedbackBox?: string;
  saveButton?: string;
}

export interface InteractionTestStep {
  field: string;
  summary: string;
  passed: boolean;
  error?: string;
}

export interface InteractionTestReport {
  steps: InteractionTestStep[];
  passed: boolean;
  error?: string;
}

// ── Cursor overlay ───────────────────────────────────────────────────────────

async function injectCursor(): Promise<void> {
  await evalScriptJSON<null>(`(function() {
    var existing = document.getElementById('ogre-test-cursor');
    if (existing) existing.remove();
    var cur = document.createElement('div');
    cur.id = 'ogre-test-cursor';
    cur.setAttribute('aria-hidden', 'true');
    cur.style.cssText = [
      'position:fixed',
      'left:0', 'top:0',
      'width:22px', 'height:22px',
      'border-radius:50%',
      'background:radial-gradient(circle, #ff3b3b 0%, #c00 70%, rgba(192,0,0,0) 100%)',
      'box-shadow:0 0 14px 4px rgba(255,59,59,0.6)',
      'pointer-events:none',
      'z-index:2147483647',
      'transform:translate(-50%, -50%)',
      'transition:left 0.45s cubic-bezier(0.4,0.0,0.2,1), top 0.45s cubic-bezier(0.4,0.0,0.2,1)',
    ].join(';');
    document.body.appendChild(cur);
    return null;
  })()`);
}

async function moveCursorTo(selector: string, index = 0): Promise<void> {
  await evalScriptJSON<null>(`(function() {
    var cur = document.getElementById('ogre-test-cursor');
    if (!cur) return null;
    var matches = document.querySelectorAll(${JSON.stringify(selector)});
    var el = matches[${index}];
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    var r = el.getBoundingClientRect();
    cur.style.left = (r.left + r.width/2) + 'px';
    cur.style.top = (r.top + r.height/2) + 'px';
    return null;
  })()`);
}

async function pulseCursor(): Promise<void> {
  await evalScriptJSON<null>(`(function() {
    var cur = document.getElementById('ogre-test-cursor');
    if (!cur) return null;
    cur.style.transition = 'transform 0.15s ease-out, box-shadow 0.15s ease-out';
    cur.style.transform = 'translate(-50%, -50%) scale(1.8)';
    cur.style.boxShadow = '0 0 28px 10px rgba(255,59,59,0.9)';
    setTimeout(function() {
      cur.style.transform = 'translate(-50%, -50%) scale(1)';
      cur.style.boxShadow = '0 0 14px 4px rgba(255,59,59,0.6)';
      cur.style.transition = 'left 0.45s cubic-bezier(0.4,0.0,0.2,1), top 0.45s cubic-bezier(0.4,0.0,0.2,1)';
    }, 180);
    return null;
  })()`);
}

async function removeCursor(): Promise<void> {
  try {
    await evalScriptJSON<null>(`(function() {
      var c = document.getElementById('ogre-test-cursor');
      if (c) c.remove();
      return null;
    })()`);
  } catch { /* ignore cleanup errors */ }
}

// ── Step helpers ─────────────────────────────────────────────────────────────

const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

async function testInputField(
  selector: string,
  testValue: string,
  index = 0,
): Promise<InteractionTestStep> {
  interface Result {
    found: boolean;
    originalValue: string;
    typedValue: string;
    readBack: string;
    tookCorrectly: boolean;
    error?: string;
  }
  const result = await evalScriptJSON<Result>(`(function() {
    try {
      var matches = document.querySelectorAll(${JSON.stringify(selector)});
      var el = matches[${index}];
      if (!el) return { found: false, originalValue: '', typedValue: '', readBack: '', tookCorrectly: false };
      var original = el.value;
      el.focus();
      el.value = ${JSON.stringify(testValue)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      var readBack = el.value;
      var took = readBack === ${JSON.stringify(testValue)};
      el.value = original;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return { found: true, originalValue: original, typedValue: ${JSON.stringify(testValue)}, readBack: readBack, tookCorrectly: took };
    } catch (err) {
      return { found: false, originalValue: '', typedValue: '', readBack: '', tookCorrectly: false, error: err.message || String(err) };
    }
  })()`);

  if (result.error) {
    return { field: 'scoreInput', summary: `ERROR: ${result.error}`, passed: false, error: result.error };
  }
  if (!result.found) {
    return { field: 'scoreInput', summary: `no element matched \`${selector}\``, passed: false };
  }
  if (!result.tookCorrectly) {
    return {
      field: 'scoreInput',
      summary: `typed "${result.typedValue}" but read back "${result.readBack}" — field did not accept the value`,
      passed: false,
    };
  }
  return {
    field: 'scoreInput',
    summary: `typed "${result.typedValue}", read back matches, restored original "${result.originalValue}"`,
    passed: true,
  };
}

/**
 * Test a contenteditable or textarea feedback area. For contenteditable, we
 * capture existing child nodes (via cloneNode) before overwriting with
 * textContent, and restore by replacing children — never parses HTML.
 */
async function testFeedbackField(
  selector: string,
  testText: string,
  index = 0,
): Promise<InteractionTestStep> {
  interface Result {
    found: boolean;
    kind: 'textarea' | 'contenteditable' | 'unknown';
    readBack: string;
    tookCorrectly: boolean;
    error?: string;
  }
  const result = await evalScriptJSON<Result>(`(function() {
    try {
      var matches = document.querySelectorAll(${JSON.stringify(selector)});
      var el = matches[${index}];
      if (!el) return { found: false, kind: 'unknown', readBack: '', tookCorrectly: false };
      var tag = el.tagName;
      var isCE = el.isContentEditable || el.getAttribute('contenteditable') === 'true';
      var kind = (tag === 'TEXTAREA') ? 'textarea' : (isCE ? 'contenteditable' : 'unknown');
      var readBack = '';
      var took = false;
      el.focus();
      if (kind === 'textarea') {
        var originalValue = el.value;
        el.value = ${JSON.stringify(testText)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        readBack = el.value;
        took = readBack.indexOf(${JSON.stringify(testText)}) !== -1;
        el.value = originalValue;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (kind === 'contenteditable') {
        // Capture existing children by cloning — safe DOM op, no HTML parsing.
        var origChildren = [];
        el.childNodes.forEach(function(n) { origChildren.push(n.cloneNode(true)); });
        // Clear existing children
        while (el.firstChild) el.removeChild(el.firstChild);
        // Write test value via textContent (no HTML parsing)
        el.textContent = ${JSON.stringify(testText)};
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        readBack = el.textContent || '';
        took = readBack.indexOf(${JSON.stringify(testText)}) !== -1;
        // Restore original children
        while (el.firstChild) el.removeChild(el.firstChild);
        for (var i = 0; i < origChildren.length; i++) el.appendChild(origChildren[i]);
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else {
        return { found: true, kind: kind, readBack: '', tookCorrectly: false, error: 'element is neither textarea nor contenteditable' };
      }
      el.blur();
      return { found: true, kind: kind, readBack: readBack.substring(0, 80), tookCorrectly: took };
    } catch (err) {
      return { found: false, kind: 'unknown', readBack: '', tookCorrectly: false, error: err.message || String(err) };
    }
  })()`);

  if (result.error) {
    return { field: 'feedbackBox', summary: `ERROR: ${result.error}`, passed: false, error: result.error };
  }
  if (!result.found) {
    return { field: 'feedbackBox', summary: `no element matched \`${selector}\``, passed: false };
  }
  if (!result.tookCorrectly) {
    return {
      field: 'feedbackBox',
      summary: `typed test text (${result.kind}) but read back did not contain it — field did not accept input`,
      passed: false,
    };
  }
  return {
    field: 'feedbackBox',
    summary: `kind=${result.kind}, typed test text, read back matches, restored original`,
    passed: true,
  };
}

async function testSaveButtonFocusable(selector: string): Promise<InteractionTestStep> {
  interface Result {
    found: boolean;
    disabled: boolean;
    tag: string;
    text: string;
    error?: string;
  }
  const result = await evalScriptJSON<Result>(`(function() {
    try {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { found: false, disabled: false, tag: '', text: '' };
      var disabled = !!el.disabled || el.getAttribute('aria-disabled') === 'true';
      el.focus();
      return {
        found: true,
        disabled: disabled,
        tag: el.tagName,
        text: (el.textContent || el.value || '').trim().substring(0, 40),
      };
    } catch (err) {
      return { found: false, disabled: false, tag: '', text: '', error: err.message || String(err) };
    }
  })()`);

  if (result.error) {
    return { field: 'saveButton', summary: `ERROR: ${result.error}`, passed: false, error: result.error };
  }
  if (!result.found) {
    return { field: 'saveButton', summary: `no element matched \`${selector}\``, passed: false };
  }
  if (result.disabled) {
    return { field: 'saveButton', summary: `found (${result.tag}, "${result.text}") but is disabled`, passed: false };
  }
  return {
    field: 'saveButton',
    summary: `found and focusable (${result.tag}, "${result.text}") — NOT clicked (would persist test data)`,
    passed: true,
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export interface RunInteractionTestOptions {
  scoreTestValue?: string;
  feedbackTestText?: string;
  stepDelayMs?: number;
}

export async function runInteractionTest(
  selectors: InteractionTestSelectors,
  options: RunInteractionTestOptions = {},
): Promise<InteractionTestReport> {
  const stepDelay = options.stepDelayMs ?? 550;
  const scoreValue = options.scoreTestValue ?? '0.5';
  const feedbackText = options.feedbackTestText ?? 'OGRE interaction test';
  const steps: InteractionTestStep[] = [];

  try {
    await injectCursor();
  } catch (e) {
    return { steps, passed: false, error: `cursor inject failed: ${String(e)}` };
  }

  // Each field runs in its own try/catch so one invalid selector (e.g.,
  // Playwright :has-text syntax) doesn't abort the entire test — the
  // remaining fields should still be exercised and reported.
  if (selectors.scoreInput) {
    try {
      await moveCursorTo(selectors.scoreInput, 0);
      await delay(stepDelay);
      await pulseCursor();
      await delay(200);
      steps.push(await testInputField(selectors.scoreInput, scoreValue, 0));
    } catch (e) {
      steps.push({
        field: 'scoreInput',
        summary: `selector threw an error: ${String(e).slice(0, 200)}`,
        passed: false,
        error: String(e),
      });
    }
  }

  if (selectors.feedbackBox) {
    try {
      await moveCursorTo(selectors.feedbackBox, 0);
      await delay(stepDelay);
      await pulseCursor();
      await delay(200);
      steps.push(await testFeedbackField(selectors.feedbackBox, feedbackText, 0));
    } catch (e) {
      steps.push({
        field: 'feedbackBox',
        summary: `selector threw an error: ${String(e).slice(0, 200)}`,
        passed: false,
        error: String(e),
      });
    }
  }

  if (selectors.saveButton) {
    try {
      await moveCursorTo(selectors.saveButton, 0);
      await delay(stepDelay);
      steps.push(await testSaveButtonFocusable(selectors.saveButton));
    } catch (e) {
      steps.push({
        field: 'saveButton',
        summary: `selector threw an error: ${String(e).slice(0, 200)}`,
        passed: false,
        error: String(e),
      });
    }
  }

  await delay(400);
  await removeCursor();

  return {
    steps,
    passed: steps.every(s => s.passed),
  };
}

export function formatInteractionReport(report: InteractionTestReport): string {
  const lines: string[] = [];
  if (report.error) {
    lines.push(`**Interaction test failed to start:** ${report.error}`);
    return lines.join('\n');
  }
  lines.push(`**Interaction test complete** — ${report.passed ? 'all steps passed' : 'some steps failed'}:`);
  for (const s of report.steps) {
    const icon = s.passed ? '✓' : '✗';
    lines.push(`- ${icon} **${s.field}**: ${s.summary}`);
  }
  lines.push('');
  if (report.passed) {
    lines.push('These selectors are confirmed to accept input in the grading workflow. Ready to save.');
  } else {
    lines.push('One or more selectors did not accept input correctly — please revise before saving.');
  }
  return lines.join('\n');
}
