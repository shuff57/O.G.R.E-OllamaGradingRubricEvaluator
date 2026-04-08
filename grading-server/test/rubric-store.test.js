import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { createRubric, updateRubric, getRubric, loadRubrics } from '../rubric-store.js';

/**
 * Rubric Store Tests
 *
 * Tests CRUD operations for rubric storage, including weightMode persistence
 * and backward compatibility with rubrics created before weightMode was added.
 */

// Use a temp directory for test isolation
const TEST_CONFIG_DIR = join(tmpdir(), 'ogre-test-rubric-store-' + Date.now());

// Mock the config module to use our temp directory
const originalEnv = process.env.OGRE_CONFIG_DIR;

beforeEach(() => {
  process.env.OGRE_CONFIG_DIR = TEST_CONFIG_DIR;
  if (!existsSync(TEST_CONFIG_DIR)) {
    mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }
});

afterEach(() => {
  // Cleanup temp directory
  if (existsSync(TEST_CONFIG_DIR)) {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  }
  process.env.OGRE_CONFIG_DIR = originalEnv;
});

// ── createRubric Tests ───────────────────────────────────────────────────

describe('createRubric', () => {
  it('should create a rubric with weightMode: category', () => {
    const rubric = createRubric({
      name: 'Test Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
      weightMode: 'category',
    });

    expect(rubric.weightMode).toBe('category');

    // Verify it persists
    const loaded = getRubric(rubric.id);
    expect(loaded.weightMode).toBe('category');
  });

  it('should create a rubric with weightMode: off', () => {
    const rubric = createRubric({
      name: 'Test Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
      weightMode: 'off',
    });

    expect(rubric.weightMode).toBe('off');

    const loaded = getRubric(rubric.id);
    expect(loaded.weightMode).toBe('off');
  });

  it('should create a rubric without weightMode when not provided (backward compat)', () => {
    const rubric = createRubric({
      name: 'Legacy Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
    });

    // weightMode should not be present on the returned object
    expect(rubric.weightMode).toBeUndefined();

    const loaded = getRubric(rubric.id);
    expect(loaded.weightMode).toBeUndefined();
  });

  it('should not include weightMode property when explicitly undefined', () => {
    const rubric = createRubric({
      name: 'Test Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
      weightMode: undefined,
    });

    expect('weightMode' in rubric).toBe(false);
  });
});

// ── updateRubric Tests ───────────────────────────────────────────────────

describe('updateRubric', () => {
  it('should update weightMode from category to off', () => {
    const rubric = createRubric({
      name: 'Test Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
      weightMode: 'category',
    });

    const updated = updateRubric(rubric.id, { weightMode: 'off' });

    expect(updated.weightMode).toBe('off');

    const loaded = getRubric(rubric.id);
    expect(loaded.weightMode).toBe('off');
  });

  it('should update weightMode from off to category', () => {
    const rubric = createRubric({
      name: 'Test Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
      weightMode: 'off',
    });

    const updated = updateRubric(rubric.id, { weightMode: 'category' });

    expect(updated.weightMode).toBe('category');

    const loaded = getRubric(rubric.id);
    expect(loaded.weightMode).toBe('category');
  });

  it('should NOT overwrite existing weightMode when update does not include it', () => {
    const rubric = createRubric({
      name: 'Test Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
      weightMode: 'category',
    });

    // Update only the name, not weightMode
    const updated = updateRubric(rubric.id, { name: 'Updated Name' });

    expect(updated.name).toBe('Updated Name');
    expect(updated.weightMode).toBe('category'); // Should preserve existing value

    const loaded = getRubric(rubric.id);
    expect(loaded.weightMode).toBe('category');
  });

  it('should allow adding weightMode to a rubric that did not have it', () => {
    const rubric = createRubric({
      name: 'Legacy Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
      // No weightMode
    });

    expect(rubric.weightMode).toBeUndefined();

    const updated = updateRubric(rubric.id, { weightMode: 'category' });

    expect(updated.weightMode).toBe('category');

    const loaded = getRubric(rubric.id);
    expect(loaded.weightMode).toBe('category');
  });

  it('should return null when updating non-existent rubric', () => {
    const result = updateRubric('non-existent-id', { weightMode: 'category' });
    expect(result).toBeNull();
  });
});

// ── Backward Compatibility Tests ─────────────────────────────────────────

describe('backward compatibility', () => {
  it('should load old rubrics without weightMode without errors', () => {
    // Simulate loading old rubrics by creating one without weightMode
    const oldRubric = createRubric({
      name: 'Old Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
    });

    // Reload all rubrics (simulates app restart)
    const allRubrics = loadRubrics();

    const found = allRubrics.find(r => r.id === oldRubric.id);
    expect(found).toBeDefined();
    expect(found.weightMode).toBeUndefined();
    expect(found.name).toBe('Old Rubric');
  });

  it('should handle mixed old and new rubrics in the same store', () => {
    const oldRubric = createRubric({
      name: 'Old Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
    });

    const newRubric = createRubric({
      name: 'New Rubric',
      criteria: [{ name: 'Test', points: 5 }],
      maxScore: 10,
      weightMode: 'category',
    });

    const allRubrics = loadRubrics();

    const foundOld = allRubrics.find(r => r.id === oldRubric.id);
    const foundNew = allRubrics.find(r => r.id === newRubric.id);

    expect(foundOld.weightMode).toBeUndefined();
    expect(foundNew.weightMode).toBe('category');
  });
});
