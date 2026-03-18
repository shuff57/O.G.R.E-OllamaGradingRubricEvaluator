import { describe, test, expect } from 'vitest';
import { formatDomForPrompt } from './agent-dom';
import { createTestDomElements, createTestSummaryElements } from './__test-utils__/agent-fixtures';

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
});
