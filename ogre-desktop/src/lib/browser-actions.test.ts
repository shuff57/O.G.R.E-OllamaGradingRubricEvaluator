import { describe, test, expect, vi, beforeEach } from 'vitest';
import { DANGEROUS_JS_PATTERNS } from './agent-types';

// Mock './browser' before importing browser-actions
vi.mock('./browser', () => ({
  evalScript: vi.fn(),
  evalScriptJSON: vi.fn(),
  captureWebviewScreenshot: vi.fn(),
  navigateEmbedded: vi.fn(),
  getActiveTabId: vi.fn(() => 'test-tab-1'),
}));

vi.mock('./cdp-actions', () => ({
  isConnected: vi.fn(() => false),
  pwClick: vi.fn(),
  pwType: vi.fn(),
  pwReadText: vi.fn(),
  pwWaitFor: vi.fn(),
  pwScroll: vi.fn(),
  pwPressKey: vi.fn(),
  pwWriteCodeMirror: vi.fn(),
  pwCapturePopup: vi.fn(),
}));

vi.mock('./cdp-client', () => ({
  cdp: {
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

import { evalScript, captureWebviewScreenshot, navigateEmbedded } from './browser';
import { cdp } from './cdp-client';
import { isConnected, pwClick, pwType, pwReadText, pwWaitFor, pwScroll, pwPressKey } from './cdp-actions';
import { executeAction } from './browser-actions';

const mockEvalScript = evalScript as ReturnType<typeof vi.fn>;
const mockScreenshot = captureWebviewScreenshot as ReturnType<typeof vi.fn>;
const mockNavigate = navigateEmbedded as ReturnType<typeof vi.fn>;
const mockIsConnected = isConnected as ReturnType<typeof vi.fn>;
const mockCdpSend = cdp.send as ReturnType<typeof vi.fn>;
const mockCdpOn = cdp.on as ReturnType<typeof vi.fn>;
const mockCdpOff = cdp.off as ReturnType<typeof vi.fn>;
const mockPwClick = pwClick as ReturnType<typeof vi.fn>;
const mockPwType = pwType as ReturnType<typeof vi.fn>;
const mockPwReadText = pwReadText as ReturnType<typeof vi.fn>;
const mockPwWaitFor = pwWaitFor as ReturnType<typeof vi.fn>;
const mockPwScroll = pwScroll as ReturnType<typeof vi.fn>;
const mockPwPressKey = pwPressKey as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPwClick.mockResolvedValue({ success: true });
  mockPwType.mockResolvedValue({ success: true });
  mockPwReadText.mockResolvedValue({ success: true, data: 'text' });
  mockPwWaitFor.mockResolvedValue({ success: true });
  mockPwScroll.mockResolvedValue({ success: true });
  mockPwPressKey.mockResolvedValue({ success: true });
});

// ---------------------------------------------------------------------------
// click
// ---------------------------------------------------------------------------

describe('executeAction: click', () => {
  test('returns result from evalScriptJSON on success', async () => {
    const expected = { success: true, data: { tagName: 'BUTTON', text: 'Submit' } };
    mockPwClick.mockResolvedValueOnce(expected);
    const result = await executeAction({ action: 'click', selector: '#submit' });
    expect(result).toEqual(expected);
    expect(mockPwClick).toHaveBeenCalledWith('#submit');
  });

  test('returns error result when evalScriptJSON throws', async () => {
    mockPwClick.mockRejectedValueOnce(new Error('IPC failed'));
    await expect(executeAction({ action: 'click', selector: '#btn' })).rejects.toThrow('IPC failed');
  });
});

// ---------------------------------------------------------------------------
// triple_click
// ---------------------------------------------------------------------------

describe('executeAction: triple_click', () => {
  test('dispatches mousePressed/mouseReleased three times with incrementing clickCount', async () => {
    mockCdpSend.mockImplementation(async (method: string) => {
      switch (method) {
        case 'Runtime.evaluate':
          return { result: { objectId: 'obj-1' } };
        case 'DOM.scrollIntoViewIfNeeded':
          return {};
        case 'DOM.getBoxModel':
          return { model: { content: [0, 0, 100, 0, 100, 100, 0, 100] } };
        case 'Input.dispatchMouseEvent':
          return {};
        default:
          return {};
      }
    });

    const result = await executeAction({ action: 'triple_click', selector: '#field' });

    expect(result.success).toBe(true);
    const mouseCalls = mockCdpSend.mock.calls.filter((call) => call[0] === 'Input.dispatchMouseEvent');
    expect(mouseCalls).toHaveLength(6);
    expect(mouseCalls[0][1]).toMatchObject({ type: 'mousePressed', clickCount: 1 });
    expect(mouseCalls[1][1]).toMatchObject({ type: 'mouseReleased', clickCount: 1 });
    expect(mouseCalls[2][1]).toMatchObject({ type: 'mousePressed', clickCount: 2 });
    expect(mouseCalls[3][1]).toMatchObject({ type: 'mouseReleased', clickCount: 2 });
    expect(mouseCalls[4][1]).toMatchObject({ type: 'mousePressed', clickCount: 3 });
    expect(mouseCalls[5][1]).toMatchObject({ type: 'mouseReleased', clickCount: 3 });
  });

  test('runs input/textarea select fallback after the mouse sequence', async () => {
    mockCdpSend.mockImplementation(async (method: string, params?: { expression?: string; returnByValue?: boolean }) => {
      switch (method) {
        case 'Runtime.evaluate':
          if (params?.returnByValue) {
            return { result: { value: { tagName: 'INPUT', isContentEditable: false } } };
          }
          return { result: { objectId: 'obj-1' } };
        case 'DOM.scrollIntoViewIfNeeded':
          return {};
        case 'DOM.getBoxModel':
          return { model: { content: [0, 0, 100, 0, 100, 100, 0, 100] } };
        case 'Input.dispatchMouseEvent':
          return {};
        default:
          return {};
      }
    });

    const result = await executeAction({ action: 'triple_click', selector: '#field' });

    expect(result.success).toBe(true);
    const runtimeCalls = mockCdpSend.mock.calls.filter((call) => call[0] === 'Runtime.evaluate');
    const selectCallIndex = mockCdpSend.mock.calls.findIndex(
      (call) => call[0] === 'Runtime.evaluate' && String(call[1]?.expression).includes('.select()'),
    );
    const lastMouseCallIndex = mockCdpSend.mock.calls
      .map((call, index) => (call[0] === 'Input.dispatchMouseEvent' ? index : -1))
      .filter((index) => index >= 0)
      .at(-1) ?? -1;

    expect(runtimeCalls.some((call) => String(call[1]?.expression).includes('.select()'))).toBe(true);
    expect(selectCallIndex).toBeGreaterThan(lastMouseCallIndex);
  });

  test('runs contenteditable range fallback after the mouse sequence', async () => {
    mockCdpSend.mockImplementation(async (method: string, params?: { expression?: string; returnByValue?: boolean }) => {
      switch (method) {
        case 'Runtime.evaluate':
          if (params?.returnByValue) {
            return { result: { value: { tagName: 'DIV', isContentEditable: true } } };
          }
          return { result: { objectId: 'obj-1' } };
        case 'DOM.scrollIntoViewIfNeeded':
          return {};
        case 'DOM.getBoxModel':
          return { model: { content: [0, 0, 100, 0, 100, 100, 0, 100] } };
        case 'Input.dispatchMouseEvent':
          return {};
        default:
          return {};
      }
    });

    const result = await executeAction({ action: 'triple_click', selector: '[contenteditable="true"]' });

    expect(result.success).toBe(true);
    const runtimeCalls = mockCdpSend.mock.calls.filter((call) => call[0] === 'Runtime.evaluate');
    const rangeCallIndex = mockCdpSend.mock.calls.findIndex(
      (call) => call[0] === 'Runtime.evaluate' && String(call[1]?.expression).includes('createRange'),
    );
    const lastMouseCallIndex = mockCdpSend.mock.calls
      .map((call, index) => (call[0] === 'Input.dispatchMouseEvent' ? index : -1))
      .filter((index) => index >= 0)
      .at(-1) ?? -1;

    expect(runtimeCalls.some((call) => String(call[1]?.expression).includes('createRange'))).toBe(true);
    expect(rangeCallIndex).toBeGreaterThan(lastMouseCallIndex);
  });
});

// ---------------------------------------------------------------------------
// type
// ---------------------------------------------------------------------------

describe('executeAction: type', () => {
  test('calls evalScriptJSON and returns success', async () => {
    mockPwType.mockResolvedValueOnce({ success: true });
    const result = await executeAction({
      action: 'type',
      selector: '#input',
      text: 'hello world',
    });
    expect(result.success).toBe(true);
    expect(mockPwType).toHaveBeenCalledWith('#input', 'hello world', undefined);
  });

  test('passes clear: true flag', async () => {
    mockPwType.mockResolvedValueOnce({ success: true });
    const result = await executeAction({
      action: 'type',
      selector: '#input',
      text: 'new value',
      clear: true,
    });
    expect(result.success).toBe(true);
    expect(mockPwType).toHaveBeenCalledWith('#input', 'new value', true);
  });

  test('returns error result when evalScriptJSON throws', async () => {
    mockPwType.mockRejectedValueOnce(new Error('Type failed'));
    await expect(executeAction({
      action: 'type',
      selector: '#input',
      text: 'text',
    })).rejects.toThrow('Type failed');
  });
});

// ---------------------------------------------------------------------------
// scroll
// ---------------------------------------------------------------------------

describe('executeAction: scroll', () => {
  test('down direction uses positive yVal', async () => {
    mockPwScroll.mockResolvedValueOnce({ success: true, data: { scrollX: 0, scrollY: 300 } });
    const result = await executeAction({ action: 'scroll', direction: 'down', amount: 300 });
    expect(result.success).toBe(true);
    expect(mockPwScroll).toHaveBeenCalledWith('down', 300);
  });

  test('up direction uses negative yVal', async () => {
    mockPwScroll.mockResolvedValueOnce({ success: true, data: { scrollX: 0, scrollY: 0 } });
    await executeAction({ action: 'scroll', direction: 'up', amount: 200 });
    expect(mockPwScroll).toHaveBeenCalledWith('up', 200);
  });

  test('left direction uses negative xVal', async () => {
    mockPwScroll.mockResolvedValueOnce({ success: true, data: { scrollX: 0, scrollY: 0 } });
    await executeAction({ action: 'scroll', direction: 'left', amount: 100 });
    expect(mockPwScroll).toHaveBeenCalledWith('left', 100);
  });

  test('right direction uses positive xVal', async () => {
    mockPwScroll.mockResolvedValueOnce({ success: true, data: { scrollX: 100, scrollY: 0 } });
    await executeAction({ action: 'scroll', direction: 'right', amount: 100 });
    expect(mockPwScroll).toHaveBeenCalledWith('right', 100);
  });
});

// ---------------------------------------------------------------------------
// readText
// ---------------------------------------------------------------------------

describe('executeAction: readText', () => {
  test('with selector: calls evalScriptJSON with selector query', async () => {
    mockPwReadText.mockResolvedValueOnce({ success: true, data: 'Section text' });
    const result = await executeAction({ action: 'readText', selector: '.content' });
    expect(result.success).toBe(true);
    expect(result.data).toBe('Section text');
    expect(mockPwReadText).toHaveBeenCalledWith('.content');
  });

  test('without selector: reads full page body text', async () => {
    mockPwReadText.mockResolvedValueOnce({ success: true, data: 'Full page text' });
    const result = await executeAction({ action: 'readText' });
    expect(result.success).toBe(true);
    expect(mockPwReadText).toHaveBeenCalledWith(undefined);
  });
});

// ---------------------------------------------------------------------------
// screenshot
// ---------------------------------------------------------------------------

describe('executeAction: screenshot', () => {
  test('returns data URL from captureWebviewScreenshot', async () => {
    mockScreenshot.mockResolvedValueOnce('data:image/png;base64,AAAA');
    const result = await executeAction({ action: 'screenshot' });
    expect(result.success).toBe(true);
    expect(result.data).toBe('data:image/png;base64,AAAA');
  });

  test('returns error result when captureWebviewScreenshot throws', async () => {
    mockScreenshot.mockRejectedValueOnce(new Error('Screenshot failed'));
    const result = await executeAction({ action: 'screenshot' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Screenshot failed');
  });
});

// ---------------------------------------------------------------------------
// waitFor
// ---------------------------------------------------------------------------

describe('executeAction: waitFor', () => {
  test('returns success from evalScriptJSON', async () => {
    mockPwWaitFor.mockResolvedValueOnce({ success: true });
    const result = await executeAction({ action: 'waitFor', selector: '#modal' });
    expect(result.success).toBe(true);
    expect(mockPwWaitFor).toHaveBeenCalledWith('#modal', undefined);
  });

  test('returns timeout error from evalScriptJSON', async () => {
    mockPwWaitFor.mockResolvedValueOnce({
      success: false,
      error: 'Timeout waiting for: #modal',
    });
    const result = await executeAction({ action: 'waitFor', selector: '#modal', timeoutMs: 1000 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout');
  });
});

// ---------------------------------------------------------------------------
// navigate
// ---------------------------------------------------------------------------

describe('executeAction: navigate', () => {
  beforeEach(() => {
    // Default: Page.enable and Page.navigate both succeed, no errorText.
    mockCdpSend.mockImplementation(async (method: string) => {
      if (method === 'Page.enable') return {};
      if (method === 'Page.navigate') return {};
      return {};
    });

    // cdp.on captures the callback so tests can fire the load event manually.
    mockCdpOn.mockImplementation((_event: string, cb: () => void) => {
      // Store the callback; fire it synchronously to simulate immediate load.
      cb();
    });

    mockCdpOff.mockImplementation(() => {});
  });

  test('sends Page.enable then Page.navigate and returns success', async () => {
    const result = await executeAction({ action: 'navigate', url: 'https://example.com' });
    expect(result.success).toBe(true);
    expect(mockCdpSend).toHaveBeenCalledWith('Page.enable');
    expect(mockCdpSend).toHaveBeenCalledWith('Page.navigate', { url: 'https://example.com' });
  });

  test('registers Page.loadEventFired listener before navigating', async () => {
    const callOrder: string[] = [];
    mockCdpOn.mockImplementation((event: string, cb: () => void) => {
      callOrder.push(`on:${event}`);
      cb(); // fire immediately
    });
    mockCdpSend.mockImplementation(async (method: string) => {
      callOrder.push(`send:${method}`);
      return {};
    });

    await executeAction({ action: 'navigate', url: 'https://example.com' });

    const onIdx = callOrder.indexOf('on:Page.loadEventFired');
    const navIdx = callOrder.indexOf('send:Page.navigate');
    expect(onIdx).toBeGreaterThanOrEqual(0);
    expect(navIdx).toBeGreaterThanOrEqual(0);
    expect(onIdx).toBeLessThan(navIdx);
  });

  test('unregisters the listener after load fires (no leak)', async () => {
    let capturedCb: (() => void) | undefined;
    mockCdpOn.mockImplementation((_event: string, cb: () => void) => {
      capturedCb = cb;
      cb(); // fire immediately to resolve
    });

    await executeAction({ action: 'navigate', url: 'https://example.com' });

    expect(mockCdpOff).toHaveBeenCalledWith('Page.loadEventFired', capturedCb);
  });

  test('returns { success: false, error } when Page.navigate rejects', async () => {
    mockCdpOn.mockImplementation(() => {}); // do NOT fire — should not reach load wait
    mockCdpSend.mockImplementation(async (method: string) => {
      if (method === 'Page.enable') return {};
      if (method === 'Page.navigate') throw new Error('Navigation blocked');
      return {};
    });

    const result = await executeAction({ action: 'navigate', url: 'https://blocked.com' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Navigation blocked');
    // Listener must be cleaned up even on error.
    expect(mockCdpOff).toHaveBeenCalledWith('Page.loadEventFired', expect.any(Function));
  });

  test('returns { success: false } when Page.navigate response has errorText', async () => {
    mockCdpOn.mockImplementation(() => {}); // do NOT fire
    mockCdpSend.mockImplementation(async (method: string) => {
      if (method === 'Page.enable') return {};
      if (method === 'Page.navigate') return { errorText: 'net::ERR_NAME_NOT_RESOLVED' };
      return {};
    });

    const result = await executeAction({ action: 'navigate', url: 'https://nonexistent.invalid' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('net::ERR_NAME_NOT_RESOLVED');
    expect(mockCdpOff).toHaveBeenCalledWith('Page.loadEventFired', expect.any(Function));
  });

  test('resolves with warning when load times out', async () => {
    vi.useFakeTimers();

    mockCdpOn.mockImplementation(() => {}); // never fires the load event
    mockCdpSend.mockImplementation(async (method: string) => {
      if (method === 'Page.enable') return {};
      if (method === 'Page.navigate') return {};
      return {};
    });

    const promise = executeAction({ action: 'navigate', url: 'https://slow.com' });

    // Advance past the 10 000ms default timeout.
    await vi.advanceTimersByTimeAsync(11_000);

    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(true);
    expect((result as { warning?: string }).warning).toMatch(/timed out/i);
    expect(mockCdpOff).toHaveBeenCalledWith('Page.loadEventFired', expect.any(Function));
  });

  test('uses CDP Page.navigate when CDP is connected', async () => {
    mockIsConnected.mockReturnValueOnce(true);
    const result = await executeAction({ action: 'navigate', url: 'https://example.com' });
    expect(result.success).toBe(true);
    expect(mockCdpSend).toHaveBeenCalledWith('Page.navigate', { url: 'https://example.com' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runJS
// ---------------------------------------------------------------------------

describe('executeAction: runJS', () => {
  test('calls evalScript with provided code', async () => {
    mockEvalScript.mockResolvedValueOnce('window.title');
    const result = await executeAction({ action: 'runJS', code: 'document.title' });
    expect(result.success).toBe(true);
    expect(result.data).toBe('window.title');
    expect(mockEvalScript).toHaveBeenCalledWith('document.title');
  });

  test('blocks code containing dangerous patterns', async () => {
    for (const pattern of DANGEROUS_JS_PATTERNS) {
      vi.clearAllMocks();
      const result = await executeAction({ action: 'runJS', code: `x = ${pattern}` });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked dangerous pattern');
      expect(mockEvalScript).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// done
// ---------------------------------------------------------------------------

describe('executeAction: done', () => {
  test('returns success: true with message', async () => {
    const result = await executeAction({ action: 'done', success: true, message: 'Task done!' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ message: 'Task done!' });
  });

  test('returns success: false with message', async () => {
    const result = await executeAction({
      action: 'done',
      success: false,
      message: 'Could not complete',
    });
    expect(result.success).toBe(false);
    expect(result.data).toEqual({ message: 'Could not complete' });
  });
});

// ---------------------------------------------------------------------------
// Unknown action
// ---------------------------------------------------------------------------

describe('executeAction: unknown action', () => {
  test('returns error for unknown action type', async () => {
    const result = await executeAction({ action: 'hover' as any, selector: '#el' } as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
    expect(result.error).toContain('hover');
  });
});


// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------

describe('executeAction: sleep', () => {
  test('resolves with sleptMs data', async () => {
    const result = await executeAction({ action: 'sleep', ms: 0 });
    expect(result.success).toBe(true);
    expect((result.data as { sleptMs: number }).sleptMs).toBe(0);
  });

  test('caps ms at 30000', async () => {
    vi.useFakeTimers();
    const promise = executeAction({ action: 'sleep', ms: 99999 });
    vi.advanceTimersByTime(30001);
    const result = await promise;
    vi.useRealTimers();
    expect(result.success).toBe(true);
    expect((result.data as { sleptMs: number }).sleptMs).toBe(30000);
  });

  test('passes through reasonable values unchanged', async () => {
    const result = await executeAction({ action: 'sleep', ms: 500 });
    expect(result.success).toBe(true);
    expect((result.data as { sleptMs: number }).sleptMs).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// pressKey
// ---------------------------------------------------------------------------

describe('executeAction: pressKey', () => {
  test('calls evalScriptJSON to dispatch KeyboardEvent', async () => {
    mockPwPressKey.mockResolvedValueOnce({ success: true });
    const result = await executeAction({ action: 'pressKey', key: 'Tab' });
    expect(result.success).toBe(true);
    expect(mockPwPressKey).toHaveBeenCalledWith('Tab');
  });

  test('passes key name to cdp press action', async () => {
    mockPwPressKey.mockResolvedValueOnce({ success: true });
    await executeAction({ action: 'pressKey', key: 'Enter' });
    expect(mockPwPressKey).toHaveBeenCalledWith('Enter');
  });

  test('supports arbitrary key names', async () => {
    mockPwPressKey.mockResolvedValueOnce({ success: true });
    await executeAction({ action: 'pressKey', key: 'Escape' });
    expect(mockPwPressKey).toHaveBeenCalledWith('Escape');
  });

  test('returns error result when evalScriptJSON throws', async () => {
    mockPwPressKey.mockRejectedValueOnce(new Error('KeyEvent failed'));
    await expect(executeAction({ action: 'pressKey', key: 'Tab' })).rejects.toThrow('KeyEvent failed');
  });
});
