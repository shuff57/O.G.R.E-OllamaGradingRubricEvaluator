// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  EXTRACTION_CONFIG_SYSTEM_PROMPT,
  isValidExtractionConfig,
  parseExtractionConfigResponse,
} from './extraction-config-discovery';
import type { ExtractionConfig } from './site-profiles';

// ============================================================================
// EXTRACTION_CONFIG_SYSTEM_PROMPT
// ============================================================================

describe('EXTRACTION_CONFIG_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof EXTRACTION_CONFIG_SYSTEM_PROMPT).toBe('string');
    expect(EXTRACTION_CONFIG_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('mentions all three responseMethod values', () => {
    expect(EXTRACTION_CONFIG_SYSTEM_PROMPT).toContain('childIndex');
    expect(EXTRACTION_CONFIG_SYSTEM_PROMPT).toContain('iframe');
    expect(EXTRACTION_CONFIG_SYSTEM_PROMPT).toContain('selector');
  });

  it('mentions all three maxScoreMethod values', () => {
    expect(EXTRACTION_CONFIG_SYSTEM_PROMPT).toContain('parentTextRegex');
    expect(EXTRACTION_CONFIG_SYSTEM_PROMPT).toContain('inputLabel');
    expect(EXTRACTION_CONFIG_SYSTEM_PROMPT).toContain('selector');
  });

  it('instructs maxScoreDefault to be a string', () => {
    expect(EXTRACTION_CONFIG_SYSTEM_PROMPT).toContain('"10"');
  });
});

// ============================================================================
// isValidExtractionConfig
// ============================================================================

describe('isValidExtractionConfig', () => {
  const minimal: ExtractionConfig = {
    responseMethod: 'selector',
    maxScoreMethod: 'parentTextRegex',
    maxScoreDefault: '10',
  };

  it('accepts minimal valid config', () => {
    expect(isValidExtractionConfig(minimal)).toBe(true);
  });

  it('accepts all valid responseMethod values', () => {
    const methods: ExtractionConfig['responseMethod'][] = ['childIndex', 'iframe', 'selector'];
    for (const m of methods) {
      expect(isValidExtractionConfig({ ...minimal, responseMethod: m })).toBe(true);
    }
  });

  it('accepts all valid maxScoreMethod values', () => {
    const methods: ExtractionConfig['maxScoreMethod'][] = [
      'parentTextRegex',
      'inputLabel',
      'selector',
    ];
    for (const m of methods) {
      expect(isValidExtractionConfig({ ...minimal, maxScoreMethod: m })).toBe(true);
    }
  });

  it('accepts full config with all optional fields', () => {
    const full: ExtractionConfig = {
      responseMethod: 'childIndex',
      responsePath: 'questionRegion.children[1].children[1]',
      maxScoreMethod: 'parentTextRegex',
      maxScoreRegex: '/(\\d+\\.?\\d*)',
      maxScoreDefault: '10',
    };
    expect(isValidExtractionConfig(full)).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidExtractionConfig(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidExtractionConfig(undefined)).toBe(false);
  });

  it('rejects invalid responseMethod', () => {
    expect(isValidExtractionConfig({ ...minimal, responseMethod: 'fixedValue' })).toBe(false);
    expect(isValidExtractionConfig({ ...minimal, responseMethod: 'selectorText' })).toBe(false);
    expect(isValidExtractionConfig({ ...minimal, responseMethod: 'xpath' })).toBe(false);
  });

  it('rejects invalid maxScoreMethod', () => {
    expect(isValidExtractionConfig({ ...minimal, maxScoreMethod: 'fixedValue' })).toBe(false);
    expect(isValidExtractionConfig({ ...minimal, maxScoreMethod: 'selectorText' })).toBe(false);
  });

  it('rejects numeric maxScoreDefault', () => {
    expect(isValidExtractionConfig({ ...minimal, maxScoreDefault: 10 })).toBe(false);
  });

  it('rejects optional field with wrong type', () => {
    expect(isValidExtractionConfig({ ...minimal, responsePath: 123 })).toBe(false);
    expect(isValidExtractionConfig({ ...minimal, maxScoreRegex: true })).toBe(false);
  });
});

// ============================================================================
// parseExtractionConfigResponse
// ============================================================================

describe('parseExtractionConfigResponse', () => {
  const validJson: ExtractionConfig = {
    responseMethod: 'selector',
    responseSelector: 'div.response',
    maxScoreMethod: 'parentTextRegex',
    maxScoreRegex: '/(\\d+)',
    maxScoreDefault: '10',
  };

  it('parses a bare JSON response', () => {
    const result = parseExtractionConfigResponse(JSON.stringify(validJson));
    expect(result).not.toBeNull();
    expect(result?.responseMethod).toBe('selector');
    expect(result?.maxScoreDefault).toBe('10');
  });

  it('strips ```json fenced code block', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(validJson)}\n\`\`\``;
    expect(parseExtractionConfigResponse(fenced)).not.toBeNull();
  });

  it('strips plain ``` fenced code block', () => {
    const fenced = `\`\`\`\n${JSON.stringify(validJson)}\n\`\`\``;
    expect(parseExtractionConfigResponse(fenced)).not.toBeNull();
  });

  it('strips <think>...</think> blocks', () => {
    const withThink = `<think>Let me analyse the DOM structure carefully...</think>\n${JSON.stringify(validJson)}`;
    expect(parseExtractionConfigResponse(withThink)).not.toBeNull();
  });

  it('strips think block before fenced code', () => {
    const both = `<think>OK</think>\n\`\`\`json\n${JSON.stringify(validJson)}\n\`\`\``;
    expect(parseExtractionConfigResponse(both)).not.toBeNull();
  });

  it('extracts JSON embedded in prose text', () => {
    const withProse = `Here is my analysis.\n\n${JSON.stringify(validJson)}\n\nLet me know if you need changes.`;
    expect(parseExtractionConfigResponse(withProse)).not.toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseExtractionConfigResponse('')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseExtractionConfigResponse('{ responseMethod: selector }')).toBeNull();
  });

  it('returns null for JSON that fails type guard', () => {
    const bad = JSON.stringify({ responseMethod: 'xpath', maxScoreMethod: 'parentTextRegex', maxScoreDefault: '10' });
    expect(parseExtractionConfigResponse(bad)).toBeNull();
  });

  it('returns null for response with no braces', () => {
    expect(parseExtractionConfigResponse('Just text, no JSON here.')).toBeNull();
  });

  it('preserves all optional fields', () => {
    const full: ExtractionConfig = {
      responseMethod: 'childIndex',
      responsePath: 'questionRegion.children[0]',
      maxScoreMethod: 'inputLabel',
      maxScorePattern: 'Grade out of (\\d+)',
      maxScoreDefault: '5',
    };
    const result = parseExtractionConfigResponse(JSON.stringify(full));
    expect(result?.responsePath).toBe('questionRegion.children[0]');
    expect(result?.maxScorePattern).toBe('Grade out of (\\d+)');
    expect(result?.maxScoreDefault).toBe('5');
  });
});
