// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  parseFormIntent,
  parseChatIntent,
  parseExampleSelections,
  intentToDiscoveryHints,
  type FormModeInput,
  type ChatMessage,
  type ExampleSelection,
  type DiscoveryHints,
  type IntentMode,
} from './discovery-intent';

// ============================================================================
// parseFormIntent
// ============================================================================

describe('parseFormIntent', () => {
  it('maps basic boolean flags', () => {
    const input: FormModeInput = {
      hasStudentNames: true,
      hasScoreInputs: true,
      hasFeedbackFields: false,
    };
    const hints = parseFormIntent(input);
    expect(hints.hasStudentNames).toBe(true);
    expect(hints.hasScoreInputs).toBe(true);
  });

  it('maps estimatedStudentCount', () => {
    const input: FormModeInput = {
      estimatedStudentCount: 30,
      hasStudentNames: false,
      hasScoreInputs: false,
      hasFeedbackFields: false,
    };
    const hints = parseFormIntent(input);
    expect(hints.estimatedStudentCount).toBe(30);
  });

  it('parses knownSelectors as JSON object', () => {
    const input: FormModeInput = {
      hasStudentNames: false,
      hasScoreInputs: false,
      hasFeedbackFields: false,
      knownSelectors: JSON.stringify({ questionRegion: 'div.question' }),
    };
    const hints = parseFormIntent(input);
    expect(hints.knownSelectors).toEqual({ questionRegion: 'div.question' });
  });

  it('falls back to extraContext for non-JSON knownSelectors', () => {
    const input: FormModeInput = {
      hasStudentNames: false,
      hasScoreInputs: false,
      hasFeedbackFields: false,
      knownSelectors: 'div.student-row',
    };
    const hints = parseFormIntent(input);
    expect(hints.knownSelectors).toBeUndefined();
    expect(hints.extraContext).toContain('div.student-row');
  });

  it('includes notes in extraContext', () => {
    const input: FormModeInput = {
      hasStudentNames: true,
      hasScoreInputs: true,
      hasFeedbackFields: false,
      notes: 'Page has 3 iframes per student',
    };
    const hints = parseFormIntent(input);
    expect(hints.extraContext).toContain('Page has 3 iframes per student');
  });
});

// ============================================================================
// parseChatIntent
// ============================================================================

describe('parseChatIntent', () => {
  it('returns empty hints for empty message list', () => {
    const hints = parseChatIntent([]);
    expect(hints.extraContext).toBeUndefined();
  });

  it('concatenates user messages into extraContext', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'There are 25 students', timestamp: new Date().toISOString() },
      { role: 'assistant', content: 'Got it', timestamp: new Date().toISOString() },
      { role: 'user', content: 'Scores are in number inputs', timestamp: new Date().toISOString() },
    ];
    const hints = parseChatIntent(messages);
    expect(hints.extraContext).toContain('25 students');
    expect(hints.extraContext).toContain('number inputs');
    // Should not include assistant message
    expect(hints.extraContext).not.toContain('Got it');
  });

  it('skips assistant messages', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', content: 'How can I help?', timestamp: new Date().toISOString() },
    ];
    const hints = parseChatIntent(messages);
    expect(hints.extraContext).toBeUndefined();
  });
});

// ============================================================================
// parseExampleSelections
// ============================================================================

describe('parseExampleSelections', () => {
  it('returns empty array for no examples', () => {
    expect(parseExampleSelections([])).toEqual([]);
  });

  it('creates one GeneralizedSelector per elementType', () => {
    const examples: ExampleSelection[] = [
      { elementType: 'scoreinput', capturedSelector: 'input.score-1', text: '', tag: 'input', attrs: {} },
      { elementType: 'scoreinput', capturedSelector: 'input.score-2', text: '', tag: 'input', attrs: {} },
      { elementType: 'studentName', capturedSelector: 'td.name-1', text: 'Alice', tag: 'td', attrs: {} },
    ];
    const result = parseExampleSelections(examples);
    expect(result).toHaveLength(2);
    const types = result.map((r) => r.elementType);
    expect(types).toContain('scoreinput');
    expect(types).toContain('studentName');
  });

  it('sets confidence based on example count (max 1)', () => {
    const examples: ExampleSelection[] = [
      { elementType: 'scoreinput', capturedSelector: 's1', text: '', tag: 'input', attrs: {} },
      { elementType: 'scoreinput', capturedSelector: 's2', text: '', tag: 'input', attrs: {} },
      { elementType: 'scoreinput', capturedSelector: 's3', text: '', tag: 'input', attrs: {} },
      { elementType: 'scoreinput', capturedSelector: 's4', text: '', tag: 'input', attrs: {} },
    ];
    const result = parseExampleSelections(examples);
    expect(result[0].confidence).toBeLessThanOrEqual(1);
  });

  it('uses first example selector verbatim (stub behavior)', () => {
    const examples: ExampleSelection[] = [
      { elementType: 'studentRow', capturedSelector: 'tr:nth-child(1)', text: '', tag: 'tr', attrs: {} },
    ];
    const result = parseExampleSelections(examples);
    expect(result[0].selector).toBe('tr:nth-child(1)');
  });
});

// ============================================================================
// intentToDiscoveryHints
// ============================================================================

describe('intentToDiscoveryHints', () => {
  it('routes form mode correctly', () => {
    const input: FormModeInput = {
      hasStudentNames: true,
      hasScoreInputs: false,
      hasFeedbackFields: false,
    };
    const hints = intentToDiscoveryHints('form', input);
    expect(hints.hasStudentNames).toBe(true);
  });

  it('routes chat mode correctly', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'mypage has 10 students', timestamp: new Date().toISOString() },
    ];
    const hints = intentToDiscoveryHints('chat', messages);
    expect(hints.extraContext).toContain('10 students');
  });

  it('routes example mode correctly', () => {
    const examples: ExampleSelection[] = [
      { elementType: 'scoreinput', capturedSelector: 'input[name=score]', text: '', tag: 'input', attrs: {} },
    ];
    const hints = intentToDiscoveryHints('example', examples);
    expect(hints.generalizedSelectors).toHaveLength(1);
    expect(hints.generalizedSelectors![0].elementType).toBe('scoreinput');
  });

  it('all three mode literals are handled without throw', () => {
    const modes: IntentMode[] = ['form', 'chat', 'example'];
    const payloads: [IntentMode, FormModeInput | ChatMessage[] | ExampleSelection[]][] = [
      ['form', { hasStudentNames: false, hasScoreInputs: false, hasFeedbackFields: false }],
      ['chat', []],
      ['example', []],
    ];
    for (const [mode, payload] of payloads) {
      expect(() => intentToDiscoveryHints(mode, payload)).not.toThrow();
    }
  });
});
