// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  parseFormIntent,
  parseChatIntent,
  parseExampleSelections,
  intentToDiscoveryHints,
  createChatDiscoveryState,
  runChatDiscovery,
  runExampleDiscovery,
  MAX_CHAT_TURNS,
  type FormModeInput,
  type ChatMessage,
  type ExampleSelection,
  type DiscoveryHints,
  type IntentMode,
  type ChatDiscoveryState,
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

  it('strips positional pseudo-classes for single examples', () => {
    const examples: ExampleSelection[] = [
      { elementType: 'studentRow', capturedSelector: 'tr:nth-child(1)', text: '', tag: 'tr', attrs: {} },
    ];
    const result = parseExampleSelections(examples);
    expect(result[0].selector).toBe('tr');
  });

  it('generalizes common tag for multiple examples', () => {
    const examples: ExampleSelection[] = [
      { elementType: 'scoreinput', capturedSelector: 'input.a', text: '', tag: 'input', attrs: {} },
      { elementType: 'scoreinput', capturedSelector: 'input.b', text: '', tag: 'input', attrs: {} },
    ];
    const result = parseExampleSelections(examples);
    expect(result[0].selector).toBe('input');
  });

  it('finds common classes across examples', () => {
    const examples: ExampleSelection[] = [
      { elementType: 'scoreinput', capturedSelector: 'input', text: '', tag: 'input', attrs: { class: 'score-field active' } },
      { elementType: 'scoreinput', capturedSelector: 'input', text: '', tag: 'input', attrs: { class: 'score-field highlighted' } },
    ];
    const result = parseExampleSelections(examples);
    expect(result[0].selector).toContain('score-field');
    expect(result[0].selector).not.toContain('active');
    expect(result[0].selector).not.toContain('highlighted');
  });

  it('finds common type attribute', () => {
    const examples: ExampleSelection[] = [
      { elementType: 'scoreinput', capturedSelector: 'input', text: '', tag: 'input', attrs: { type: 'number' } },
      { elementType: 'scoreinput', capturedSelector: 'input', text: '', tag: 'input', attrs: { type: 'number' } },
    ];
    const result = parseExampleSelections(examples);
    expect(result[0].selector).toContain('[type="number"]');
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

// ============================================================================
// parseFormIntent (enhanced)
// ============================================================================

describe('parseFormIntent (enhanced)', () => {
  it('builds requiredSelectors from boolean flags', () => {
    const input: FormModeInput = {
      hasStudentNames: true,
      hasScoreInputs: true,
      hasFeedbackFields: true,
    };
    const hints = parseFormIntent(input);
    expect(hints.requiredSelectors).toContain('studentName');
    expect(hints.requiredSelectors).toContain('scoreInput');
    expect(hints.requiredSelectors).toContain('feedbackBox');
  });

  it('omits requiredSelectors when no fields selected', () => {
    const input: FormModeInput = {
      hasStudentNames: false,
      hasScoreInputs: false,
      hasFeedbackFields: false,
    };
    const hints = parseFormIntent(input);
    expect(hints.requiredSelectors).toBeUndefined();
  });

  it('builds pageDescription from boolean flags', () => {
    const input: FormModeInput = {
      hasStudentNames: true,
      hasScoreInputs: true,
      hasFeedbackFields: false,
      estimatedStudentCount: 25,
    };
    const hints = parseFormIntent(input);
    expect(hints.pageDescription).toContain('Student names');
    expect(hints.pageDescription).toContain('Score input');
    expect(hints.pageDescription).toContain('25');
  });

  it('builds promptAddendum from flags and notes', () => {
    const input: FormModeInput = {
      hasStudentNames: true,
      hasScoreInputs: false,
      hasFeedbackFields: false,
      notes: 'Uses TinyMCE editor',
    };
    const hints = parseFormIntent(input);
    expect(hints.promptAddendum).toContain('Student names');
    expect(hints.promptAddendum).toContain('TinyMCE editor');
  });
});

// ============================================================================
// parseChatIntent (enhanced)
// ============================================================================

describe('parseChatIntent (enhanced)', () => {
  it('extracts student count from messages', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'There are 25 students on the page', timestamp: new Date().toISOString() },
    ];
    const hints = parseChatIntent(messages);
    expect(hints.estimatedStudentCount).toBe(25);
  });

  it('detects score input mentions', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Scores are in number inputs', timestamp: new Date().toISOString() },
    ];
    const hints = parseChatIntent(messages);
    expect(hints.hasScoreInputs).toBe(true);
  });

  it('detects sequential navigation mode', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Students are shown one at a time', timestamp: new Date().toISOString() },
    ];
    const hints = parseChatIntent(messages);
    expect(hints.navigationMode).toBe('sequential');
  });

  it('detects batch navigation mode', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'All students are visible at once', timestamp: new Date().toISOString() },
    ];
    const hints = parseChatIntent(messages);
    expect(hints.navigationMode).toBe('batch');
  });

  it('builds requiredSelectors from detected needs', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'I need feedback fields identified', timestamp: new Date().toISOString() },
    ];
    const hints = parseChatIntent(messages);
    expect(hints.requiredSelectors).toContain('feedbackBox');
  });
});

// ============================================================================
// runChatDiscovery
// ============================================================================

describe('runChatDiscovery', () => {
  it('adds user message and gets AI response', async () => {
    const state = createChatDiscoveryState();
    const sendMessage = async () => 'What kind of page is this?';
    const result = await runChatDiscovery(state, 'I need help finding selectors', sendMessage);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.turnCount).toBe(1);
    expect(result.isComplete).toBe(false);
  });

  it('returns same state when already complete', async () => {
    const state: ChatDiscoveryState = {
      messages: [],
      turnCount: 5,
      isComplete: true,
      hints: {},
    };
    const sendMessage = async () => 'should not be called';
    const result = await runChatDiscovery(state, 'hello', sendMessage);
    expect(result).toBe(state);
  });

  it('forces completion at max turns without calling AI', async () => {
    const state: ChatDiscoveryState = {
      messages: [
        { role: 'user', content: 'turn 1', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'assistant', content: 'resp 1', timestamp: '2024-01-01T00:00:01Z' },
        { role: 'user', content: 'turn 2', timestamp: '2024-01-01T00:00:02Z' },
        { role: 'assistant', content: 'resp 2', timestamp: '2024-01-01T00:00:03Z' },
      ],
      turnCount: MAX_CHAT_TURNS - 1,
      isComplete: false,
      hints: {},
    };
    let aiCalled = false;
    const sendMessage = async () => { aiCalled = true; return 'nope'; };
    const result = await runChatDiscovery(state, 'final message', sendMessage);
    expect(result.isComplete).toBe(true);
    expect(result.turnCount).toBe(MAX_CHAT_TURNS);
    expect(aiCalled).toBe(false);
  });

  it('extracts hints from accumulated messages', async () => {
    const state = createChatDiscoveryState();
    const sendMessage = async () => 'Got it, looking for 25 students.';
    const result = await runChatDiscovery(state, 'There are 25 students', sendMessage);
    expect(result.hints.estimatedStudentCount).toBe(25);
  });
});

// ============================================================================
// runExampleDiscovery
// ============================================================================

describe('runExampleDiscovery', () => {
  it('returns generalized selectors and hints', () => {
    const selections: ExampleSelection[] = [
      { elementType: 'scoreinput', capturedSelector: 'input.s1', text: '', tag: 'input', attrs: {} },
      { elementType: 'scoreinput', capturedSelector: 'input.s2', text: '', tag: 'input', attrs: {} },
    ];
    const result = runExampleDiscovery(selections);
    expect(result.selections).toBe(selections);
    expect(result.generalizedSelectors).toHaveLength(1);
    expect(result.generalizedSelectors[0].elementType).toBe('scoreinput');
    expect(result.hints.generalizedSelectors).toHaveLength(1);
  });

  it('returns empty results for no selections', () => {
    const result = runExampleDiscovery([]);
    expect(result.generalizedSelectors).toEqual([]);
    expect(result.hints.generalizedSelectors).toEqual([]);
  });
});
