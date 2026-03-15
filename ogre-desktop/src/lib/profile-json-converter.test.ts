import { describe, expect, it } from 'vitest';
import { convertProfileToJSON } from './profile-json-converter';
import { isSiteGuideJSON } from './site-guide-types';
// @ts-expect-error Vite raw import type is resolved at test runtime
import momContent from '../assets/profiles/myopenmath.md?raw';
// @ts-expect-error Vite raw import type is resolved at test runtime
import aeriesContent from '../assets/profiles/aeries.md?raw';

describe('convertProfileToJSON', () => {
  it('extracts MyOpenMath site name from real profile', () => {
    const result = convertProfileToJSON(momContent);
    expect(result.site).toMatch(/myopenmath/i);
  });

  it('extracts at least 5 MyOpenMath selectors', () => {
    const result = convertProfileToJSON(momContent);
    expect(Object.keys(result.selectors).length).toBeGreaterThanOrEqual(5);
  });

  it('extracts at least 3 MyOpenMath navigation entries', () => {
    const result = convertProfileToJSON(momContent);
    expect(Object.keys(result.navigation).length).toBeGreaterThanOrEqual(3);
  });

  it('extracts at least 1 MyOpenMath workflow with steps', () => {
    const result = convertProfileToJSON(momContent);
    expect(result.workflows.length).toBeGreaterThanOrEqual(1);
    expect(result.workflows.some((w) => w.steps.length >= 2)).toBe(true);
  });

  it('extracts at least 3 MyOpenMath gotchas', () => {
    const result = convertProfileToJSON(momContent);
    expect(result.gotchas.length).toBeGreaterThanOrEqual(3);
  });

  it('extracts at least 5 Aeries selectors', () => {
    const result = convertProfileToJSON(aeriesContent);
    expect(Object.keys(result.selectors).length).toBeGreaterThanOrEqual(5);
  });

  it('extracts at least 3 Aeries navigation entries', () => {
    const result = convertProfileToJSON(aeriesContent);
    expect(Object.keys(result.navigation).length).toBeGreaterThanOrEqual(3);
  });

  it('extracts at least 3 Aeries gotchas', () => {
    const result = convertProfileToJSON(aeriesContent);
    expect(result.gotchas.length).toBeGreaterThanOrEqual(3);
  });

  it('returns minimal valid SiteGuideJSON for empty string', () => {
    const result = convertProfileToJSON('');
    expect(isSiteGuideJSON(result)).toBe(true);
    expect(result.site).toBe('');
    expect(result.baseUrl).toBe('');
    expect(result.role).toBe('');
    expect(result.urlPatterns).toEqual([]);
    expect(result.workflows).toEqual([]);
    expect(result.gotchas).toEqual([]);
  });

  it('does not crash on malformed markdown/frontmatter and returns valid shape', () => {
    const malformed = '---\nname: Broken\n- [unterminated\n\n# Header\nNot really structured';
    const result = convertProfileToJSON(malformed);
    expect(isSiteGuideJSON(result)).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        site: expect.any(String),
        baseUrl: expect.any(String),
        role: expect.any(String),
        urlPatterns: expect.any(Array),
        selectors: expect.any(Object),
        navigation: expect.any(Object),
        workflows: expect.any(Array),
        gotchas: expect.any(Array)
      })
    );
  });
});
