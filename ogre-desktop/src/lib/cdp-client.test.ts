import { describe, test, expect, vi, beforeEach } from 'vitest';

// Stub browser globals before module import (node test env has neither)
const MockWebSocket = vi.fn();
(MockWebSocket as unknown as Record<string, number>).OPEN = 1;
(MockWebSocket as unknown as Record<string, number>).CLOSED = 3;
vi.stubGlobal('WebSocket', MockWebSocket);
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

import { CDPClient, cdp } from './cdp-client';

let client: CDPClient;

beforeEach(async () => {
  vi.clearAllMocks();
  client = new CDPClient();
  await client.disconnect();
});

describe('cdp-client: connection state', () => {
  test('isConnected returns false initially', () => {
    expect(client.isConnected()).toBe(false);
  });

  test('connect returns false when no CDP server (fetch rejects)', async () => {
    const result = await client.connect(99999);
    expect(result).toBe(false);
  });

  test('isConnected returns false after failed connection attempt', async () => {
    await client.connect(99999);
    expect(client.isConnected()).toBe(false);
  });

  test('disconnect does not throw when not connected', async () => {
    await expect(client.disconnect()).resolves.not.toThrow();
  });

  test('send rejects when not connected', async () => {
    await expect(client.send('Runtime.evaluate')).rejects.toThrow('Not connected');
  });
});

describe('cdp-client: singleton export', () => {
  test('cdp singleton is an instance of CDPClient', () => {
    expect(cdp).toBeInstanceOf(CDPClient);
  });

  test('cdp singleton is not connected initially', () => {
    expect(cdp.isConnected()).toBe(false);
  });
});
