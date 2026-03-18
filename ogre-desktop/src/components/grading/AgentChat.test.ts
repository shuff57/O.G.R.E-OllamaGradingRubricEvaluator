import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const componentSource = readFileSync(
  join(__dirname, 'AgentChat.svelte'),
  'utf-8'
);

describe('AgentChat compact mode', () => {
  test('compactMode state variable exists with default true', () => {
    expect(componentSource).toContain('let compactMode: boolean = $state(true)');
  });

  test('compact-badge CSS class exists', () => {
    expect(componentSource).toContain('.compact-badge');
  });

  test('badge-success CSS class exists', () => {
    expect(componentSource).toContain('.badge-success');
  });

  test('badge-failure CSS class exists', () => {
    expect(componentSource).toContain('.badge-failure');
  });

  test('compact-toggle button exists', () => {
    expect(componentSource).toContain('compact-toggle');
  });

  test('thinking dots hidden in compact mode', () => {
    expect(componentSource).toContain('!compactMode');
  });

  test('compact: true is passed to controller.start', () => {
    expect(componentSource).toContain('compact: compactMode');
  });

  test('getBadgeLabel helper function exists', () => {
    expect(componentSource).toContain('function getBadgeLabel');
  });
});

describe('AgentChat URL reactivity', () => {
  test('accepts pageLoadedUrl prop', () => {
    expect(componentSource).toContain('pageLoadedUrl');
  });

  test('$effect reads pageLoadedUrl synchronously to create reactive dependency', () => {
    // The $effect must synchronously read pageLoadedUrl before any async call
    // Pattern: const url = pageLoadedUrl; (or direct reference)
    // This ensures Svelte 5 tracks it as a dependency
    const effectBlock = componentSource.match(/\$effect\(\(\)\s*=>\s*\{[^}]+\}/s)?.[0] ?? '';
    expect(effectBlock).toContain('pageLoadedUrl');
  });

  test('checkActiveProfile accepts url parameter', () => {
    expect(componentSource).toContain('checkActiveProfile(url)');
  });

  test('refreshMatchingSkills accepts url parameter', () => {
    expect(componentSource).toContain('refreshMatchingSkills(url)');
  });

  test('console.warn used in catch blocks for debuggability', () => {
    expect(componentSource).toContain('console.warn');
  });
});
