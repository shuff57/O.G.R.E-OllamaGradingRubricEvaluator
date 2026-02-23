import { describe, test, expect } from 'vitest';
import { findFuzzyMatch, fuzzyMatchReason } from './agent-dom-fuzzy';
import type { InteractiveElement } from './agent-types';

// Helper to create a minimal valid InteractiveElement
function el(overrides: Partial<InteractiveElement> & Pick<InteractiveElement, 'tag' | 'selector'>): InteractiveElement {
  return {
    index: 0,
    visible: true,
    disabled: false,
    text: '',
    ...overrides,
  };
}

describe('findFuzzyMatch', () => {
  test('returns null for empty elements array', () => {
    expect(findFuzzyMatch('#btn', [])).toBeNull();
  });

  test('returns null for empty selector', () => {
    const elements = [el({ tag: 'button', selector: '#btn', text: 'Submit' })];
    expect(findFuzzyMatch('', elements)).toBeNull();
  });

  describe('Strategy 1: text match', () => {
    test('matches element by quoted text in selector', () => {
      const elements = [
        el({ tag: 'button', selector: '#submit-btn', text: 'Submit Form' }),
        el({ tag: 'button', selector: '#cancel-btn', text: 'Cancel' }),
      ];
      // Selector with quoted text hint
      const result = findFuzzyMatch('button:has-text("Submit")', elements);
      expect(result).not.toBeNull();
      expect(result!.selector).toBe('#submit-btn');
    });

    test('text match is case-insensitive', () => {
      const elements = [el({ tag: 'button', selector: '#ok-btn', text: 'OK Button' })];
      const result = findFuzzyMatch('button:has-text("ok button")', elements);
      expect(result).not.toBeNull();
    });
  });

  describe('Strategy 2: partial ID or class match', () => {
    test('matches element by partial ID in selector', () => {
      const elements = [
        el({ tag: 'button', selector: '#login-button', id: 'login-button', text: '' }),
        el({ tag: 'div', selector: 'div.wrapper', text: '' }),
      ];
      const result = findFuzzyMatch('#login', elements);
      expect(result).not.toBeNull();
      expect(result!.selector).toBe('#login-button');
    });

    test('matches element by class substring', () => {
      const elements = [
        el({ tag: 'button', selector: 'button.submit-btn.primary', text: '' }),
      ];
      const result = findFuzzyMatch('.submit-btn', elements);
      expect(result).not.toBeNull();
    });
  });

  describe('Strategy 3: aria-label match', () => {
    test('matches element by aria-label attribute', () => {
      const elements = [
        el({ tag: 'button', selector: 'button[aria-label="Close dialog"]', text: '' }),
        el({ tag: 'button', selector: '#other', text: '' }),
      ];
      const result = findFuzzyMatch('[aria-label="Close dialog"]', elements);
      expect(result).not.toBeNull();
      expect(result!.selector).toContain('aria-label');
    });
  });

  describe('Strategy 4: tag + position heuristic', () => {
    test('matches first visible element of matching tag', () => {
      const elements = [
        el({ tag: 'input', selector: 'input[name=email]', visible: false }),
        el({ tag: 'input', selector: 'input[name=username]', index: 1, visible: true }),
      ];
      const result = findFuzzyMatch('input', elements);
      expect(result).not.toBeNull();
      expect(result!.visible).toBe(true);
    });

    test('skips invisible elements in tag heuristic', () => {
      const elements = [
        el({ tag: 'button', selector: '#hidden', visible: false }),
      ];
      const result = findFuzzyMatch('button', elements);
      // All are invisible → should still find or return null depending on implementation
      // Strategy 4 requires visible: true
      expect(result).toBeNull();
    });
  });

  test('returns null when all 4 strategies fail', () => {
    const elements = [
      el({ tag: 'div', selector: 'div.wrapper', text: '' }),
    ];
    const result = findFuzzyMatch('#totally-unique-xyz-12345', elements);
    expect(result).toBeNull();
  });
});

describe('fuzzyMatchReason', () => {
  test('returns a non-empty string', () => {
    const element = el({ tag: 'button', selector: '#new-btn', text: 'Submit', id: 'new-btn' });
    const reason = fuzzyMatchReason('#old-btn', element, 0);
    expect(typeof reason).toBe('string');
    expect(reason.length).toBeGreaterThan(0);
  });

  test('includes "Fuzzy matched" in the output', () => {
    const element = el({ tag: 'button', selector: '#btn', text: 'OK' });
    const reason = fuzzyMatchReason('#bad-selector', element, 1);
    expect(reason).toContain('Fuzzy matched');
  });

  test('includes the original failed selector', () => {
    const element = el({ tag: 'button', selector: '#btn', text: 'OK' });
    const reason = fuzzyMatchReason('#specific-selector', element, 2);
    expect(reason).toContain('#specific-selector');
  });
});
