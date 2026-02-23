import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock playwright-core before the module is imported
// playwright-executor uses dynamic import, so we mock the module
vi.mock('playwright-core', () => ({
  chromium: {
    connectOverCDP: vi.fn().mockRejectedValue(new Error('ECONNREFUSED - no CDP server')),
  },
}));

import { connectCDP, disconnectCDP, isConnected, pwClick, pwType, pwReadText, pwWaitFor, pwScroll } from './playwright-executor';

beforeEach(async () => {
  vi.clearAllMocks();
  // Disconnect if previously connected
  await disconnectCDP();
});

describe('playwright-executor: connection state', () => {
  test('isConnected returns false initially', () => {
    expect(isConnected()).toBe(false);
  });

  test('connectCDP returns false when CDP server is unavailable', async () => {
    const result = await connectCDP(9222);
    expect(result).toBe(false);
  });

  test('isConnected returns false after failed connection attempt', async () => {
    await connectCDP(9999);
    expect(isConnected()).toBe(false);
  });

  test('disconnectCDP does not throw when not connected', async () => {
    await expect(disconnectCDP()).resolves.not.toThrow();
  });
});

describe('playwright-executor: actions when not connected', () => {
  test('pwClick returns failure result when not connected', async () => {
    expect(isConnected()).toBe(false);
    const result = await pwClick('#btn');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });

  test('pwType returns failure result when not connected', async () => {
    const result = await pwType('#input', 'hello');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('pwReadText returns failure result when not connected', async () => {
    const result = await pwReadText('#content');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('pwWaitFor returns failure result when not connected', async () => {
    const result = await pwWaitFor('#element', 1000);
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('pwScroll returns failure result when not connected', async () => {
    const result = await pwScroll('down', 300);
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('all action functions never throw — always return ActionResult', async () => {
    // Even when not connected, functions must return {success, error} never throw
    await expect(pwClick('#btn')).resolves.toHaveProperty('success');
    await expect(pwType('#input', 'text')).resolves.toHaveProperty('success');
    await expect(pwReadText()).resolves.toHaveProperty('success');
    await expect(pwWaitFor('#el')).resolves.toHaveProperty('success');
    await expect(pwScroll('up', 100)).resolves.toHaveProperty('success');
  });
});
