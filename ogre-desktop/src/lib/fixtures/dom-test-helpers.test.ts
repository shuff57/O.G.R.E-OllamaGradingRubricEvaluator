// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFixture,
  queryAll,
  countElements,
  getTextOf,
  hasDataAttr,
  getDataAttrValues,
} from './dom-test-helpers';

// ============================================================================
// simple-batch.html
// ============================================================================

describe('simple-batch.html', () => {
  beforeEach(() => {
    loadFixture('simple-batch.html');
  });

  it('loads 3 student rows with data-lastchange', () => {
    expect(countElements('[data-lastchange]')).toBe(3);
  });

  it('has 3 score inputs of type=number', () => {
    expect(countElements('input[type="number"]')).toBe(3);
  });

  it('has 3 feedback textareas', () => {
    expect(countElements('textarea')).toBe(3);
  });

  it('contains student name "Alice Johnson"', () => {
    const names = queryAll('.student-name').map((el) => el.textContent?.trim());
    expect(names).toContain('Alice Johnson');
  });

  it('contains student name "Bob Smith"', () => {
    const names = queryAll('.student-name').map((el) => el.textContent?.trim());
    expect(names).toContain('Bob Smith');
  });

  it('contains student name "Carol Davis"', () => {
    const names = queryAll('.student-name').map((el) => el.textContent?.trim());
    expect(names).toContain('Carol Davis');
  });

  it('hasDataAttr returns true for lastchange', () => {
    expect(hasDataAttr('lastchange')).toBe(true);
  });

  it('getDataAttrValues returns 3 lastchange values', () => {
    const vals = getDataAttrValues('lastchange');
    expect(vals).toHaveLength(3);
  });

  it('has a save button', () => {
    expect(countElements('#save-all')).toBe(1);
  });
});

// ============================================================================
// messy-wrappers.html
// ============================================================================

describe('messy-wrappers.html', () => {
  beforeEach(() => {
    loadFixture('messy-wrappers.html');
  });

  it('still has 2 student rows despite wrapper nesting', () => {
    expect(countElements('[data-lastchange]')).toBe(2);
  });

  it('has 2 number inputs', () => {
    expect(countElements('input[type="number"]')).toBe(2);
  });

  it('contains no svg visible at top level (decorative)', () => {
    // SVG is present but should be identified as low-priority decorative
    expect(countElements('svg')).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// iframe-grading.html
// ============================================================================

describe('iframe-grading.html', () => {
  beforeEach(() => {
    loadFixture('iframe-grading.html');
  });

  it('has 2 iframes', () => {
    expect(countElements('iframe')).toBe(2);
  });

  it('has 2 score inputs', () => {
    expect(countElements('input[type="number"]')).toBe(2);
  });

  it('iframes have sandbox attribute', () => {
    const iframes = queryAll('iframe');
    for (const iframe of iframes) {
      expect(iframe.hasAttribute('sandbox')).toBe(true);
    }
  });

  it('score inputs have aria-label', () => {
    const inputs = queryAll('.score-field');
    for (const input of inputs) {
      expect(input.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

// ============================================================================
// sequential-grading.html
// ============================================================================

describe('sequential-grading.html', () => {
  beforeEach(() => {
    loadFixture('sequential-grading.html');
  });

  it('has exactly one score input', () => {
    expect(countElements('input[type="number"]')).toBe(1);
  });

  it('has one feedback textarea', () => {
    expect(countElements('textarea')).toBe(1);
  });

  it('has prev/next navigation buttons', () => {
    expect(countElements('#prev-student')).toBe(1);
    expect(countElements('#next-student')).toBe(1);
  });

  it('shows one student name in the header', () => {
    const header = getTextOf('h2');
    expect(header).toContain('Carol Davis');
  });

  it('has data-student attribute on response div', () => {
    expect(hasDataAttr('student')).toBe(true);
  });
});

// ============================================================================
// hidden-content.html
// ============================================================================

describe('hidden-content.html', () => {
  beforeEach(() => {
    loadFixture('hidden-content.html');
  });

  it('has one visible student row', () => {
    expect(countElements('.visible[data-lastchange]')).toBe(1);
  });

  it('has hidden rows (display:none)', () => {
    expect(countElements('.hidden-display[data-lastchange]')).toBe(1);
  });

  it('has 5 number inputs total (visible + hidden)', () => {
    expect(countElements('input[type="number"]')).toBe(5);
  });
});

// ============================================================================
// large-page.html
// ============================================================================

describe('large-page.html', () => {
  beforeEach(() => {
    loadFixture('large-page.html');
  });

  it('has 30 student rows with data-lastchange', () => {
    expect(countElements('[data-lastchange]')).toBe(30);
  });

  it('has 30 number inputs', () => {
    expect(countElements('input[type="number"]')).toBe(30);
  });

  it('has 30 textareas', () => {
    expect(countElements('textarea')).toBe(30);
  });

  it('has a save-all button', () => {
    expect(countElements('#save-all')).toBe(1);
  });
});

// ============================================================================
// batch-grading-complex.html
// ============================================================================

describe('batch-grading-complex.html', () => {
  beforeEach(() => {
    loadFixture('batch-grading-complex.html');
  });

  it('has a grading table', () => {
    expect(countElements('#grading-table')).toBe(1);
  });

  it('has 3 tbody rows with data-lastchange', () => {
    expect(countElements('tr[data-lastchange]')).toBe(3);
  });

  it('has 3 score inputs', () => {
    expect(countElements('input.score-input')).toBe(3);
  });

  it('has per-row save buttons', () => {
    expect(countElements('.save-row-btn')).toBe(3);
  });

  it('has data-student attributes', () => {
    expect(hasDataAttr('student')).toBe(true);
  });
});

// ============================================================================
// unknown-lms.html
// ============================================================================

describe('unknown-lms.html', () => {
  beforeEach(() => {
    loadFixture('unknown-lms.html');
  });

  it('has 2 submission articles', () => {
    expect(countElements('article.submission')).toBe(2);
  });

  it('has 2 text inputs for points', () => {
    expect(countElements('input.pts-input')).toBe(2);
  });

  it('has 2 comment textareas', () => {
    expect(countElements('textarea.comments')).toBe(2);
  });

  it('has no data-lastchange (generic LMS)', () => {
    expect(hasDataAttr('lastchange')).toBe(false);
  });

  it('has aria-labels on score inputs', () => {
    const inputs = queryAll('.pts-input');
    for (const input of inputs) {
      expect(input.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

// ============================================================================
// Helper function unit tests
// ============================================================================

describe('queryAll', () => {
  beforeEach(() => {
    loadFixture('simple-batch.html');
  });

  it('returns empty array for non-matching selector', () => {
    expect(queryAll('.nonexistent-class')).toEqual([]);
  });

  it('returns array of Element objects', () => {
    const results = queryAll('.student-name');
    expect(results.length).toBeGreaterThan(0);
    results.forEach((el) => expect(el).toBeInstanceOf(Element));
  });
});

describe('getTextOf', () => {
  beforeEach(() => {
    loadFixture('simple-batch.html');
  });

  it('returns text of first matching element', () => {
    const text = getTextOf('.student-name');
    expect(text).not.toBeNull();
    expect(text!.length).toBeGreaterThan(0);
  });

  it('returns null for non-matching selector', () => {
    expect(getTextOf('.does-not-exist')).toBeNull();
  });
});
