import { describe, test, expect, vi } from 'vitest';

vi.mock('./provider-sync', function () {
  return {
    getHandshakeToken: vi.fn(function () {
      return null;
    }),
  };
});

import { parseAgentResponse } from './agent-api';

describe('parseAgentResponse', function () {
  test('parses a direct action JSON response with nested params', function () {
    const result = parseAgentResponse('{"action":"click","params":{"selector":"#submit"},"reasoning":"open form"}');

    expect(result).toEqual({
      action: 'click',
      params: { selector: '#submit' },
      reasoning: 'open form',
    });
  });

  test('parses JSON inside markdown fences', function () {
    const result = parseAgentResponse('```json\n{"text":"fenced response"}\n```');

    expect(result).toEqual({ text: 'fenced response' });
  });

  test('strips think blocks before parsing', function () {
    const result = parseAgentResponse('<think>plan first</think>{"text":"visible response"}');

    expect(result).toEqual({ text: 'visible response' });
  });

  test('strips HTML comment blocks before parsing', function () {
    const result = parseAgentResponse('<!-- hidden reasoning -->{"text":"comment cleaned"}');

    expect(result).toEqual({ text: 'comment cleaned' });
  });

  test('removes trailing commas before parsing', function () {
    const result = parseAgentResponse('{"action":"click","params":{"selector":"#save",},"reasoning":"done",}');

    expect(result).toEqual({
      action: 'click',
      params: { selector: '#save' },
      reasoning: 'done',
    });
  });

  test('unescapes HTML entities before parsing', function () {
    const result = parseAgentResponse('{"text":"Fish &amp; Chips &lt;3 &gt; 2"}');

    expect(result).toEqual({ text: 'Fish & Chips <3 > 2' });
  });

  test('unwraps JSON from surrounding wrapper text', function () {
    const result = parseAgentResponse('assistant output: {"text":"wrapped response"} thanks');

    expect(result).toEqual({ text: 'wrapped response' });
  });

  test('parses JSON wrapped in inline backticks', function () {
    const result = parseAgentResponse('`{"text":"inline code response"}`');

    expect(result).toEqual({ text: 'inline code response' });
  });

  test('treats click(#foo) as plain text after removing regex fallback parsing', function () {
    const result = parseAgentResponse('click(#foo)');

    expect(result).toEqual({ text: 'click(#foo)' });
  });

  test('returns plain text for completely invalid input', function () {
    const result = parseAgentResponse('not json, not an action, just text');

    expect(result).toEqual({ text: 'not json, not an action, just text' });
  });
});
