import { describe, it, expect } from 'vitest';
import { selectBestProfile } from './profile-precedence';
import type { Skill } from './db';

describe('selectBestProfile', () => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const createSkill = (overrides: Partial<Skill>): Skill => ({
    id: 'test-id',
    name: 'Test Skill',
    description: 'Test',
    content: 'test content',
    source: 'site-profile',
    source_id: null,
    is_active: 1,
    url_pattern: 'example.com',
    learned_corrections: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  });

  it('returns null for empty array', () => {
    expect(selectBestProfile([])).toBeNull();
  });

  it('returns the single profile when only one matches', () => {
    const skill = createSkill({ id: 'single' });
    expect(selectBestProfile([skill])).toBe(skill);
  });

  it('prefers user-created over bundled for same URL', () => {
    const bundled = createSkill({
      id: 'bundled',
      source: 'site-profile',
      url_pattern: 'example.com',
    });
    const userCreated = createSkill({
      id: 'user-created',
      source: 'created',
      url_pattern: 'example.com',
    });

    const result = selectBestProfile([bundled, userCreated]);
    expect(result?.id).toBe('user-created');
  });

  it('prefers source=local over bundled', () => {
    const bundled = createSkill({
      id: 'bundled',
      source: 'site-profile',
      url_pattern: 'example.com',
    });
    const local = createSkill({
      id: 'local',
      source: 'local',
      url_pattern: 'example.com',
    });

    const result = selectBestProfile([bundled, local]);
    expect(result?.id).toBe('local');
  });

  it('picks longer url_pattern when precedence is equal', () => {
    const shortPattern = createSkill({
      id: 'short',
      source: 'created',
      url_pattern: 'example',
    });
    const longPattern = createSkill({
      id: 'long',
      source: 'created',
      url_pattern: 'example.com/path/to/resource',
    });

    const result = selectBestProfile([shortPattern, longPattern]);
    expect(result?.id).toBe('long');
  });

  it('picks most recently updated when precedence and length are equal', () => {
    const older = createSkill({
      id: 'older',
      source: 'created',
      url_pattern: 'example.com',
      updated_at: sixtyDaysAgo.toISOString(),
    });
    const newer = createSkill({
      id: 'newer',
      source: 'created',
      url_pattern: 'example.com',
      updated_at: now.toISOString(),
    });

    const result = selectBestProfile([older, newer]);
    expect(result?.id).toBe('newer');
  });

  it('detects user-modified bundled profile (updated > 30 days after created)', () => {
    const pristine = createSkill({
      id: 'pristine',
      source: 'site-profile',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      url_pattern: 'example.com',
    });
    const userModified = createSkill({
      id: 'modified',
      source: 'site-profile',
      created_at: sixtyDaysAgo.toISOString(),
      updated_at: now.toISOString(),
      url_pattern: 'example.com',
    });

    const result = selectBestProfile([pristine, userModified]);
    expect(result?.id).toBe('modified');
  });

  it('handles null url_pattern gracefully', () => {
    const withPattern = createSkill({
      id: 'with-pattern',
      url_pattern: 'example.com',
    });
    const noPattern = createSkill({
      id: 'no-pattern',
      url_pattern: null,
    });

    const result = selectBestProfile([withPattern, noPattern]);
    expect(result?.id).toBe('with-pattern');
  });

  it('complex scenario: user-created beats user-modified bundled', () => {
    const userCreated = createSkill({
      id: 'user-created',
      source: 'created',
      url_pattern: 'example.com',
      updated_at: thirtyDaysAgo.toISOString(),
    });
    const userModifiedBundled = createSkill({
      id: 'modified-bundled',
      source: 'site-profile',
      created_at: sixtyDaysAgo.toISOString(),
      updated_at: now.toISOString(),
      url_pattern: 'example.com',
    });

    const result = selectBestProfile([userModifiedBundled, userCreated]);
    expect(result?.id).toBe('user-created');
  });
});
