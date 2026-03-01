import { describe, it, expect } from 'vitest';

// Inline helper — mirrors the extension's parseJSONResponse (not in grading-server package)
function parseJSONResponse(input) {
  if (input == null || input === '') throw new Error('Invalid JSON: empty input');
  const stripped = String(input).replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(stripped);
}

describe('parseJSONResponse', () => {
  it('should parse valid JSON without fences', () => {
    const input = '{"key": "value", "num": 42}';
    const result = parseJSONResponse(input);

    expect(result).toEqual({ key: 'value', num: 42 });
  });

  it('should parse JSON wrapped in ```json fences', () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = parseJSONResponse(input);

    expect(result).toEqual({ key: 'value' });
  });

  it('should parse JSON wrapped in ``` fences (no json tag)', () => {
    const input = '```\n{"key": "value"}\n```';
    const result = parseJSONResponse(input);

    expect(result).toEqual({ key: 'value' });
  });

  it('should throw an error on invalid JSON', () => {
    const input = 'this is not json at all';

    expect(() => parseJSONResponse(input)).toThrowError(/JSON|parse/i);
  });

  it('should throw an error on empty string', () => {
    expect(() => parseJSONResponse('')).toThrowError(/JSON|parse/i);
  });

  it('should handle JSON arrays', () => {
    const input = '[{"score": 8}, {"score": 9}]';
    const result = parseJSONResponse(input);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].score).toBe(8);
  });

  it('should handle null/undefined input gracefully', () => {
    expect(() => parseJSONResponse(null)).toThrowError(/JSON|parse/i);
    expect(() => parseJSONResponse(undefined)).toThrowError(/JSON|parse/i);
  });
});
