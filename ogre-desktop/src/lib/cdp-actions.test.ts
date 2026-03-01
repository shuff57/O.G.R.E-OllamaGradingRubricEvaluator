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
  pwClick, pwType, pwReadText, pwWaitFor, pwScroll, pwPressKey,
  pwWriteCodeMirror, pwCapturePopup,
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


// ---------------------------------------------------------------------------
// pwPressKey
// ---------------------------------------------------------------------------

describe('cdp-actions: pwPressKey when not connected', () => {
  test('returns failure when not connected', async () => {
    const result = await pwPressKey('Tab');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('never throws — always returns ActionResult', async () => {
    await expect(pwPressKey('Enter')).resolves.toHaveProperty('success');
  });
});

describe('cdp-actions: pwPressKey when connected', () => {
  beforeEach(() => {
    mockCdp.isConnected.mockReturnValue(true);
    mockCdp.send.mockResolvedValue({});
  });

  test('sends keyDown and keyUp events', async () => {
    const result = await pwPressKey('Tab');
    expect(result.success).toBe(true);
    const calls = mockCdp.send.mock.calls.map((c: [string, unknown]) => c[0]);
    expect(calls).toContain('Input.dispatchKeyEvent');
    expect(mockCdp.send).toHaveBeenCalledTimes(2);
  });

  test('sends correct key code for Tab (keyCode=9)', async () => {
    await pwPressKey('Tab');
    const keyDownCall = mockCdp.send.mock.calls[0][1] as Record<string, unknown>;
    expect(keyDownCall.type).toBe('keyDown');
    expect(keyDownCall.key).toBe('Tab');
    expect(keyDownCall.windowsVirtualKeyCode).toBe(9);
  });

  test('sends correct key code for Enter (keyCode=13)', async () => {
    await pwPressKey('Enter');
    const keyDownCall = mockCdp.send.mock.calls[0][1] as Record<string, unknown>;
    expect(keyDownCall.windowsVirtualKeyCode).toBe(13);
  });

  test('sends correct key code for Escape (keyCode=27)', async () => {
    await pwPressKey('Escape');
    const keyDownCall = mockCdp.send.mock.calls[0][1] as Record<string, unknown>;
    expect(keyDownCall.windowsVirtualKeyCode).toBe(27);
  });

  test('unknown key falls back to keyCode=0', async () => {
    await pwPressKey('F13');
    const keyDownCall = mockCdp.send.mock.calls[0][1] as Record<string, unknown>;
    expect(keyDownCall.windowsVirtualKeyCode).toBe(0);
  });

  test('returns error result when cdp.send throws', async () => {
    mockCdp.send.mockRejectedValueOnce(new Error('CDP send failed'));
    const result = await pwPressKey('Tab');
    expect(result.success).toBe(false);
    expect(result.error).toBe('CDP send failed');
  });
});


// ---------------------------------------------------------------------------
// pwWriteCodeMirror
// ---------------------------------------------------------------------------

describe('cdp-actions: pwWriteCodeMirror when not connected', () => {
  test('returns failure when not connected', async () => {
    const result = await pwWriteCodeMirror('#control', '$a = 5;');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('never throws', async () => {
    await expect(pwWriteCodeMirror('#qtext', 'hello')).resolves.toHaveProperty('success');
  });
});

describe('cdp-actions: pwWriteCodeMirror when connected', () => {
  beforeEach(() => {
    mockCdp.isConnected.mockReturnValue(true);
  });

  test('calls Runtime.evaluate with returnByValue and returns success', async () => {
    mockCdp.send.mockResolvedValueOnce({
      result: { value: { success: true, data: { lines: 3 } } },
    });
    const result = await pwWriteCodeMirror('#control', '$a = rands(1,10,1)\n$answer = $a + 3');
    expect(result.success).toBe(true);
    expect(mockCdp.send).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({
      returnByValue: true,
    }));
  });

  test('passes value via JSON.stringify so PHP dollar signs are safe', async () => {
    mockCdp.send.mockResolvedValueOnce({ result: { value: { success: true, data: { lines: 1 } } } });
    await pwWriteCodeMirror('#control', '$answer = $a + $b;');
    const callExpr = (mockCdp.send.mock.calls[0][1] as { expression: string }).expression;
    expect(callExpr).toContain('"$answer = $a + $b;"');
  });

  test('propagates CodeMirror not-found error from page', async () => {
    mockCdp.send.mockResolvedValueOnce({
      result: { value: { success: false, error: 'No CodeMirror instance found on #control' } },
    });
    const result = await pwWriteCodeMirror('#control', 'x');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/CodeMirror/);
  });

  test('returns error when cdp.send throws', async () => {
    mockCdp.send.mockRejectedValueOnce(new Error('ws broken'));
    const result = await pwWriteCodeMirror('#control', 'code');
    expect(result.success).toBe(false);
    expect(result.error).toBe('ws broken');
  });
});


// ---------------------------------------------------------------------------
// pwCapturePopup
// ---------------------------------------------------------------------------

describe('cdp-actions: pwCapturePopup when not connected', () => {
  test('returns failure when not connected', async () => {
    const result = await pwCapturePopup();
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  test('never throws', async () => {
    await expect(pwCapturePopup()).resolves.toHaveProperty('success');
  });
});

describe('cdp-actions: pwCapturePopup when connected — no popup appears', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockCdp.isConnected.mockReturnValue(true);
    mockInvoke.mockResolvedValue(9222);
    const targets = [{ type: 'page', url: 'https://www.myopenmath.com/course/moddataset.php', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/page/A' }];
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => targets,
    } as Response);
  });

  afterEach(() => fetchSpy.mockRestore());

  test('returns error when no new popup target appears', async () => {
    const result = await pwCapturePopup(400);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no popup/i);
  });
});