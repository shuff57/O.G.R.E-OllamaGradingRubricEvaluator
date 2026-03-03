import { describe, it, expect } from 'vitest';
import { stripStudentName, hashStudentId, sanitizeForStorage } from './privacy';

describe('privacy — stripStudentName', () => {
  it('removes exact name occurrences', () => {
    expect(stripStudentName('John Smith did the work.', 'John Smith')).toBe(
      '[STUDENT] did the work.'
    );
  });

  it('handles case variations (all lowercase)', () => {
    expect(stripStudentName('john smith is great', 'John Smith')).toBe('[STUDENT] is great');
  });

  it('handles case variations (all uppercase)', () => {
    expect(stripStudentName('JOHN SMITH answered correctly.', 'John Smith')).toBe(
      '[STUDENT] answered correctly.'
    );
  });

  it('strips first-name-only mentions', () => {
    expect(stripStudentName('John did this. John also did that.', 'John Smith')).toBe(
      '[STUDENT] did this. [STUDENT] also did that.'
    );
  });

  it('returns original text when name not found', () => {
    expect(stripStudentName('No name here.', 'John Smith')).toBe('No name here.');
  });

  it('handles null name gracefully — returns response unchanged', () => {
    expect(stripStudentName('Some text.', null)).toBe('Some text.');
  });

  it('handles names with apostrophes (O\'Brien)', () => {
    expect(stripStudentName("O'Brien submitted the work.", "O'Brien")).toBe(
      "[STUDENT] submitted the work."
    );
  });

  it('handles hyphenated names', () => {
    expect(stripStudentName('Mary-Jane completed the test.', 'Mary-Jane')).toBe(
      '[STUDENT] completed the test.'
    );
  });

  it('replaces multiple occurrences of full name', () => {
    expect(stripStudentName('John Smith wrote: John Smith is smart.', 'John Smith')).toBe(
      '[STUDENT] wrote: [STUDENT] is smart.'
    );
  });
});

describe('privacy — hashStudentId', () => {
  it('returns consistent hash for same input', async () => {
    const h1 = await hashStudentId('John Smith');
    const h2 = await hashStudentId('John Smith');
    expect(h1).toBe(h2);
  });

  it('different inputs produce different hashes', async () => {
    const h1 = await hashStudentId('John Smith');
    const h2 = await hashStudentId('Jane Doe');
    expect(h1).not.toBe(h2);
  });

  it('returns exactly 16-character hex string', async () => {
    const h = await hashStudentId('John Smith');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hash does not contain the original name', async () => {
    const h = await hashStudentId('John Smith');
    expect(h.toLowerCase()).not.toContain('john');
    expect(h.toLowerCase()).not.toContain('smith');
  });
});

describe('privacy — sanitizeForStorage', () => {
  it('strips name and returns hash', async () => {
    const result = await sanitizeForStorage('John Smith answered: 42', 'John Smith');
    expect(result.sanitizedResponse).toBe('[STUDENT] answered: 42');
    expect(result.studentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns null hash when name is null', async () => {
    const result = await sanitizeForStorage('Some text.', null);
    expect(result.sanitizedResponse).toBe('Some text.');
    expect(result.studentHash).toBeNull();
  });

  it('student hash is consistent across calls', async () => {
    const r1 = await sanitizeForStorage('text', 'Alice Wonder');
    const r2 = await sanitizeForStorage('other text', 'Alice Wonder');
    expect(r1.studentHash).toBe(r2.studentHash);
  });
});
