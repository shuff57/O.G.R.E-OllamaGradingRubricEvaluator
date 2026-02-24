import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before module import
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(9222),
}));

vi.mock('./cdp-client', () => ({
  cdp: {
    connect: vi.fn().mockResolvedValue(false),
    connectToUrl: vi.fn().mockResolvedValue(false),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(false),
    send: vi.fn().mockResolvedValue({}),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

import { invoke } from '@tauri-apps/api/core';
import { cdp } from './cdp-client';
import {
  connectCDP, disconnectCDP, isConnected,
  pwClick, pwType, pwReadText, pwWaitFor, pwScroll,
  cdpScreenshot,
} from './cdp-actions';

const mockInvoke = invoke as ReturnType<typeof vi.fn>;
const mockCdp = cdp as {
  connect: ReturnType<typeof vi.fn>;
  connectToUrl: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  isConnected: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCdp.isConnected.mockReturnValue(false);
  mockCdp.connect.mockResolvedValue(false);
  mockCdp.connectToUrl.mockResolvedValue(false);
  mockCdp.send.mockResolvedValue({});
});

describe('cdp-actions: connection', () => {
  test('connectCDP without port calls invoke("get_cdp_port") then discover_cdp_target', async () => {
    mockInvoke.mockResolvedValueOnce(9222).mockResolvedValueOnce('ws://127.0.0.1:9222/devtools/page/ABC');
    mockCdp.connectToUrl.mockResolvedValueOnce(true);
    await connectCDP();
    expect(mockInvoke).toHaveBeenCalledWith('get_cdp_port');
    expect(mockInvoke).toHaveBeenCalledWith('discover_cdp_target', { port: 9222 });
  });

  test('connectCDP returns false when discover_cdp_target returns null', async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const result = await connectCDP(9222);
    expect(result).toBe(false);
  });

  test('connectCDP returns true when discovery and connectToUrl succeed', async () => {
    mockInvoke.mockResolvedValueOnce('ws://127.0.0.1:9222/devtools/page/ABC');
    mockCdp.connectToUrl.mockResolvedValueOnce(true);
    const result = await connectCDP(9222);
    expect(result).toBe(true);
    expect(mockCdp.connectToUrl).toHaveBeenCalledWith('ws://127.0.0.1:9222/devtools/page/ABC');
  });

  test('isConnected delegates to cdp.isConnected', () => {
    mockCdp.isConnected.mockReturnValue(false);
    expect(isConnected()).toBe(false);
    mockCdp.isConnected.mockReturnValue(true);
    expect(isConnected()).toBe(true);
  });

  test('disconnectCDP calls cdp.disconnect', async () => {
    await disconnectCDP();
    expect(mockCdp.disconnect).toHaveBeenCalled();
  });
});

describe('cdp-actions: actions when not connected', () => {
  test('pwClick returns failure when not connected', async () => {
    const result = await pwClick('#btn');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });

  test('pwType returns failure when not connected', async () => {
    const result = await pwType('#input', 'hello');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('pwReadText returns failure when not connected', async () => {
    const result = await pwReadText('#content');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('pwWaitFor returns failure when not connected', async () => {
    const result = await pwWaitFor('#el', 1000);
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('pwScroll returns failure when not connected', async () => {
    const result = await pwScroll('down', 300);
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('all pw* functions never throw — always return ActionResult', async () => {
    await expect(pwClick('#btn')).resolves.toHaveProperty('success');
    await expect(pwType('#input', 'text')).resolves.toHaveProperty('success');
    await expect(pwReadText()).resolves.toHaveProperty('success');
    await expect(pwWaitFor('#el')).resolves.toHaveProperty('success');
    await expect(pwScroll('up', 100)).resolves.toHaveProperty('success');
  });
});

describe('cdp-actions: actions when connected', () => {
  beforeEach(() => {
    mockCdp.isConnected.mockReturnValue(true);
    // Default mock: returns sensible CDP responses by method
    mockCdp.send.mockImplementation(async (method: string) => {
      switch (method) {
        case 'Runtime.evaluate':
          return { result: { objectId: 'test-obj-1', value: true } };
        case 'DOM.getBoxModel':
          return { model: { content: [0, 0, 100, 0, 100, 100, 0, 100] } };
        case 'Page.captureScreenshot':
          return { data: 'abc123' };
        default:
          return {};
      }
    });
  });

  test('pwClick returns success when element found', async () => {
    const result = await pwClick('#btn');
    expect(result.success).toBe(true);
  });

  test('pwType returns success', async () => {
    const result = await pwType('#input', 'hello');
    expect(result.success).toBe(true);
  });

  test('pwReadText returns success with data', async () => {
    const result = await pwReadText('#content');
    expect(result.success).toBe(true);
  });

  test('pwWaitFor returns success when element found immediately', async () => {
    const result = await pwWaitFor('#el', 1000);
    expect(result.success).toBe(true);
  });

  test('pwScroll returns success', async () => {
    const result = await pwScroll('down', 300);
    expect(result.success).toBe(true);
  });

  test('cdpScreenshot returns data URL in jpeg base64 format', async () => {
    const result = await cdpScreenshot();
    expect(result).toBe('data:image/jpeg;base64,abc123');
    expect(result.startsWith('data:image/jpeg;base64,')).toBe(true);
  });
});
