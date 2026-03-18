import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock dependencies BEFORE imports
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./browser', () => ({
  evalScriptJSON: vi.fn(),
  evalScript: vi.fn(),
}));

import { invoke } from './electron-bridge';
import { evalScriptJSON } from './browser';
import {
  setGdkActiveTab,
  isGdkAvailable,
  gdkClick,
  gdkType,
  gdkPressKey,
  gdkScroll,
} from './gdk-actions';

const mockInvoke = invoke as ReturnType<typeof vi.fn>;
const mockEvalScriptJSON = evalScriptJSON as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setGdkActiveTab('default');
  // Set up default rect response for selector resolution
  mockEvalScriptJSON.mockResolvedValue({ x: 100, y: 50, width: 50, height: 20 });
});

describe('gdk-actions: gdkClick', () => {
  test('gdkClick resolves selector to coordinates and invokes simulate_mouse_event', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce({ x: 200, y: 300, width: 100, height: 40 });
    const result = await gdkClick('#my-button');
    expect(result.success).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('simulate_mouse_event', {
      tabId: 'default',
      eventType: 'click',
      x: 200,
      y: 300,
      button: 1,
      modifiers: 0,
    });
  });

  test('gdkClick returns error when element not found', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce(null);
    const result = await gdkClick('#nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('#nonexistent');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('gdk-actions: gdkType', () => {
  test('gdkType clicks element first, then invokes simulate_text_input', async () => {
    // First call: click's resolveElementCenter, returns a rect
    mockEvalScriptJSON.mockResolvedValueOnce({ x: 100, y: 50, width: 50, height: 20 });
    const result = await gdkType('#input', 'hello world');
    expect(result.success).toBe(true);
    // First invoke: simulate_mouse_event for the click
    expect(mockInvoke).toHaveBeenCalledWith('simulate_mouse_event', expect.objectContaining({
      eventType: 'click',
    }));
    // Second invoke: simulate_text_input
    expect(mockInvoke).toHaveBeenCalledWith('simulate_text_input', {
      tabId: 'default',
      text: 'hello world',
    });
  });

  test('gdkType with clear=true evaluates clear script before typing', async () => {
    // resolveElementCenter for click
    mockEvalScriptJSON.mockResolvedValueOnce({ x: 100, y: 50, width: 50, height: 20 });
    // clear script call returns undefined
    mockEvalScriptJSON.mockResolvedValueOnce(undefined);

    const result = await gdkType('#input', 'new text', true);
    expect(result.success).toBe(true);
    // evalScriptJSON called twice: once for rect, once for clear
    expect(mockEvalScriptJSON).toHaveBeenCalledTimes(2);
    // simulate_text_input still called
    expect(mockInvoke).toHaveBeenCalledWith('simulate_text_input', {
      tabId: 'default',
      text: 'new text',
    });
  });
});

describe('gdk-actions: gdkPressKey', () => {
  test('gdkPressKey maps Enter to correct GDK keyval and invokes simulate_key_event', async () => {
    const result = await gdkPressKey('Enter');
    expect(result.success).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('simulate_key_event', {
      tabId: 'default',
      eventType: 'keypress',
      keyVal: 0xff0d,  // GDK_Return
      modifiers: 0,
    });
  });

  test('gdkPressKey returns error for multi-char unknown key', async () => {
    const result = await gdkPressKey('F13');  // Not in GDK_KEYVAL, length > 1
    expect(result.success).toBe(false);
    expect(result.error).toContain('F13');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('gdk-actions: isGdkAvailable', () => {
  test('isGdkAvailable returns false in test environment (no __TAURI_INTERNALS__)', () => {
    // jsdom doesn't set window.__TAURI_INTERNALS__
    const result = isGdkAvailable();
    expect(result).toBe(false);
  });
});

describe('gdk-actions: setGdkActiveTab', () => {
  test('setGdkActiveTab changes the active tab used by subsequent commands', async () => {
    setGdkActiveTab('tab-abc');
    mockEvalScriptJSON.mockResolvedValueOnce({ x: 100, y: 50, width: 50, height: 20 });
    await gdkClick('.btn');
    expect(mockInvoke).toHaveBeenCalledWith('simulate_mouse_event', expect.objectContaining({
      tabId: 'tab-abc',
    }));
  });
});

describe('gdk-actions: gdkScroll', () => {
  test('gdkScroll with direction=down invokes evalScriptJSON with correct scroll amount', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce(undefined);
    const result = await gdkScroll('down', 3);
    expect(result.success).toBe(true);
    expect(mockEvalScriptJSON).toHaveBeenCalledWith('window.scrollBy(0, 300)');
  });

  test('gdkScroll with direction=up invokes evalScriptJSON with negative scroll', async () => {
    mockEvalScriptJSON.mockResolvedValueOnce(undefined);
    const result = await gdkScroll('up', 2);
    expect(result.success).toBe(true);
    expect(mockEvalScriptJSON).toHaveBeenCalledWith('window.scrollBy(0, -200)');
  });
});
