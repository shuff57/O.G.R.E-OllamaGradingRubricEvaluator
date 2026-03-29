import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./browser', () => ({
  evalScript: vi.fn(),
  evalScriptJSON: vi.fn(),
  captureWebviewScreenshot: vi.fn(),
  navigateEmbedded: vi.fn(),
}));

vi.mock('./agent-dom', () => ({
  captureInteractiveDom: vi.fn().mockResolvedValue([]),
  formatDomForPrompt: vi.fn().mockReturnValue(''),
}));

vi.mock('./agent-dom-fuzzy', () => ({
   findFuzzyMatch: vi.fn().mockReturnValue(null),
   fuzzyMatchReason: vi.fn().mockReturnValue('Fuzzy matched via text: Submit → #submit-btn'),
}));

vi.mock('./cdp-actions', () => ({
  isConnected: vi.fn().mockReturnValue(false),
  pwClick: vi.fn(),
  pwType: vi.fn(),
  pwReadText: vi.fn(),
  pwWaitFor: vi.fn(),
  pwScroll: vi.fn(),
}));

import { captureInteractiveDom } from './agent-dom';
import { findFuzzyMatch } from './agent-dom-fuzzy';
import { pwClick, pwType, pwScroll } from './cdp-actions';
import { executeAction } from './browser-actions';

const mockCaptureInteractiveDom = captureInteractiveDom as ReturnType<typeof vi.fn>;
const mockFindFuzzyMatch = findFuzzyMatch as ReturnType<typeof vi.fn>;
const mockPwClick = pwClick as ReturnType<typeof vi.fn>;
const mockPwType = pwType as ReturnType<typeof vi.fn>;
const mockPwScroll = pwScroll as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPwClick.mockResolvedValue({ success: true });
  mockPwType.mockResolvedValue({ success: true });
  mockPwScroll.mockResolvedValue({ success: true });
});

describe('executeAction: fuzzy retry integration', () => {
  test('click with bad selector retries via fuzzy and succeeds', async () => {
    const matchedElement = {
      index: 0, tag: 'button', text: 'Submit', selector: '#submit-btn', visible: true, disabled: false,
    };

    // First click fails, second succeeds (with substituted selector)
    mockPwClick
      .mockResolvedValueOnce({ success: false, error: 'Element not found: #bad' })
      .mockResolvedValueOnce({ success: true });

    mockCaptureInteractiveDom.mockResolvedValueOnce([matchedElement]);
    mockFindFuzzyMatch.mockReturnValueOnce({ element: matchedElement, strategyIndex: 0 });

    const result = await executeAction({ action: 'click', selector: '#bad-submit' });

    expect(result.success).toBe(true);
    expect(mockCaptureInteractiveDom).toHaveBeenCalledOnce();
    expect(mockFindFuzzyMatch).toHaveBeenCalledOnce();
    // Fuzzy match metadata should be in result.data
    expect((result.data as any)?.fuzzyMatch).toBeTruthy();
    expect(typeof (result.data as any)?.fuzzyMatch).toBe('string');
  });

  test('scroll action does NOT trigger fuzzy retry', async () => {
    mockPwScroll.mockResolvedValueOnce({ success: false, error: 'Scroll failed' });

    await executeAction({ action: 'scroll', direction: 'down', amount: 300 });

    // captureInteractiveDom must NOT be called for scroll
    expect(mockCaptureInteractiveDom).not.toHaveBeenCalled();
  });

  test('click with bad selector and no fuzzy match returns original failure', async () => {
    mockPwClick.mockResolvedValueOnce({ success: false, error: 'Element not found: #bad' });
    mockFindFuzzyMatch.mockReturnValueOnce(null); // no match found

    const result = await executeAction({ action: 'click', selector: '#totally-missing' });

    expect(result.success).toBe(false);
  });

  test('type action with failing selector retries via fuzzy', async () => {
    const matchedElement = {
      index: 0, tag: 'input', text: '', selector: 'input[name=email]', visible: true, disabled: false,
    };

    mockPwType
      .mockResolvedValueOnce({ success: false, error: 'Element not found: #email-input' })
      .mockResolvedValueOnce({ success: true });

    mockCaptureInteractiveDom.mockResolvedValueOnce([matchedElement]);
    mockFindFuzzyMatch.mockReturnValueOnce({ element: matchedElement, strategyIndex: 3 });

    const result = await executeAction({ action: 'type', selector: '#email-input', text: 'test@example.com' });

    expect(result.success).toBe(true);
    expect(mockCaptureInteractiveDom).toHaveBeenCalledOnce();
  });

  test('navigate action does NOT trigger fuzzy retry', async () => {
    const { navigateEmbedded } = await import('./browser');
    (navigateEmbedded as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Navigate failed'));

    await executeAction({ action: 'navigate', url: 'https://example.com' });

    expect(mockCaptureInteractiveDom).not.toHaveBeenCalled();
  });
});
