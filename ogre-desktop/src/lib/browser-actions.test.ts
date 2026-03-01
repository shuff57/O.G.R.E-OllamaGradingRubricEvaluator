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
  },
}));

import { evalScript, evalScriptJSON, captureWebviewScreenshot, navigateEmbedded, getActiveTabId } from './browser';
import { cdp } from './cdp-client';
import { isConnected } from './cdp-actions';
import { executeAction } from './browser-actions';

const mockEvalScriptJSON = evalScriptJSON as ReturnType<typeof vi.fn>;
const mockEvalScript = evalScript as ReturnType<typeof vi.fn>;
const mockScreenshot = captureWebviewScreenshot as ReturnType<typeof vi.fn>;
const mockNavigate = navigateEmbedded as ReturnType<typeof vi.fn>;
const mockGetActiveTabId = getActiveTabId as ReturnType<typeof vi.fn>;
const mockIsConnected = isConnected as ReturnType<typeof vi.fn>;
const mockCdpSend = (cdp as { send: ReturnType<typeof vi.fn> }).send;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// click
// ---------------------------------------------------------------------------

describe('executeAction: click', () => {
  test('returns result from evalScriptJSON on success', async () => {
    const expected = { success: true, data: { tagName: 'BUTTON', text: 'Submit' } };
    mockEvalScriptJSON.mockResolvedValueOnce(expected);
    const result = await executeAction({ action: 'click', selector: '#submit' });
    expect(result).toEqual(expected);
    expect(mockEvalScriptJSON).toHaveBeenCalledOnce();
  });

  test('returns error result when evalScriptJSON throws', async () => {
    mockEvalScriptJSON.mockRejectedValueOnce(new Error('IPC failed'));
    const result = await executeAction({ action: 'click', selector: '#btn' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('IPC failed');
  });
});

// ---------------------------------------------------------------------------
// type
// ---------------------------------------------------------------------------

describe('executeAction: type', () => {
  test('calls evalScriptJSON and returns success', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true });
    const result = await executeAction({
      action: 'type',
      selector: '#input',
      text: 'hello world',
    });
    expect(result.success).toBe(true);
    expect(mockEvalScriptJSON).toHaveBeenCalledOnce();
  });

  test('passes clear: true flag', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true });
    const result = await executeAction({
      action: 'type',
      selector: '#input',
      text: 'new value',
      clear: true,
    });
    expect(result.success).toBe(true);
    // The code passed to evalScriptJSON should contain the clear logic
    const code = mockEvalScriptJSON.mock.calls[0][0];
    expect(code).toContain('true');
  });

  test('returns error result when evalScriptJSON throws', async () => {
    mockEvalScriptJSON.mockRejectedValueOnce(new Error('Type failed'));
    const result = await executeAction({
      action: 'type',
      selector: '#input',
      text: 'text',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Type failed');
  });
});

// ---------------------------------------------------------------------------
// scroll
// ---------------------------------------------------------------------------

describe('executeAction: scroll', () => {
  test('down direction uses positive yVal', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true, data: { scrollX: 0, scrollY: 300 } });
    const result = await executeAction({ action: 'scroll', direction: 'down', amount: 300 });
    expect(result.success).toBe(true);
    const code = mockEvalScriptJSON.mock.calls[0][0];
    expect(code).toContain('window.scrollBy(0, 300)');
  });

  test('up direction uses negative yVal', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true, data: { scrollX: 0, scrollY: 0 } });
    await executeAction({ action: 'scroll', direction: 'up', amount: 200 });
    const code = mockEvalScriptJSON.mock.calls[0][0];
    expect(code).toContain('window.scrollBy(0, -200)');
  });

  test('left direction uses negative xVal', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true, data: { scrollX: 0, scrollY: 0 } });
    await executeAction({ action: 'scroll', direction: 'left', amount: 100 });
    const code = mockEvalScriptJSON.mock.calls[0][0];
    expect(code).toContain('window.scrollBy(-100, 0)');
  });

  test('right direction uses positive xVal', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true, data: { scrollX: 100, scrollY: 0 } });
    await executeAction({ action: 'scroll', direction: 'right', amount: 100 });
    const code = mockEvalScriptJSON.mock.calls[0][0];
    expect(code).toContain('window.scrollBy(100, 0)');
  });
});

// ---------------------------------------------------------------------------
// readText
// ---------------------------------------------------------------------------

describe('executeAction: readText', () => {
  test('with selector: calls evalScriptJSON with selector query', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true, data: 'Section text' });
    const result = await executeAction({ action: 'readText', selector: '.content' });
    expect(result.success).toBe(true);
    expect(result.data).toBe('Section text');
    const code = mockEvalScriptJSON.mock.calls[0][0];
    expect(code).toContain('.content');
  });

  test('without selector: reads full page body text', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true, data: 'Full page text' });
    const result = await executeAction({ action: 'readText' });
    expect(result.success).toBe(true);
    const code = mockEvalScriptJSON.mock.calls[0][0];
    expect(code).toContain('document.body.innerText');
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
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true });
    const result = await executeAction({ action: 'waitFor', selector: '#modal' });
    expect(result.success).toBe(true);
  });

  test('returns timeout error from evalScriptJSON', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({
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
  test('calls navigateEmbedded with tabId and url, returns success', async () => {
    mockNavigate.mockResolvedValueOnce(undefined);
    const result = await executeAction({ action: 'navigate', url: 'https://example.com' });
    expect(result.success).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith('test-tab-1', 'https://example.com');
  });

  test('returns error result when navigateEmbedded throws', async () => {
    mockNavigate.mockRejectedValueOnce(new Error('Navigation blocked'));
    const result = await executeAction({ action: 'navigate', url: 'https://example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Navigation blocked');
  });

  test('uses CDP Page.navigate when CDP is connected', async () => {
    mockIsConnected.mockReturnValueOnce(true);
    mockCdpSend.mockResolvedValueOnce({});
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
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true });
    const result = await executeAction({ action: 'pressKey', key: 'Tab' });
    expect(result.success).toBe(true);
    expect(mockEvalScriptJSON).toHaveBeenCalledOnce();
  });

  test('embeds key name in dispatched code', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true });
    await executeAction({ action: 'pressKey', key: 'Enter' });
    const code = mockEvalScriptJSON.mock.calls[0][0];
    expect(code).toContain("'Enter'");
    expect(code).toContain('KeyboardEvent');
  });

  test('dispatches keydown, keypress, and keyup', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ success: true });
    await executeAction({ action: 'pressKey', key: 'Escape' });
    const code = mockEvalScriptJSON.mock.calls[0][0];
    expect(code).toContain('keydown');
    expect(code).toContain('keypress');
    expect(code).toContain('keyup');
  });

  test('returns error result when evalScriptJSON throws', async () => {
    mockEvalScriptJSON.mockRejectedValueOnce(new Error('KeyEvent failed'));
    const result = await executeAction({ action: 'pressKey', key: 'Tab' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('KeyEvent failed');
  });
});