import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Tauri APIs ──────────────────────────────────────────────────────
// Browser functions call invoke() / listen() — mock them to avoid needing
// a running Tauri runtime.

const mockInvoke = vi.fn().mockResolvedValue(undefined);
const mockListen = vi.fn().mockResolvedValue(vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

// Mock autofill since browser.ts imports it
vi.mock('./autofill', () => ({
  generateAutoFillScript: vi.fn().mockReturnValue('/* mock script */'),
}));

// Import AFTER mocks
import {
  createEmbeddedBrowser,
  navigateEmbedded,
  goBack,
  goForward,
  reloadBrowser,
  setWebviewBounds,
  hideWebview,
  showWebview,
  getEmbeddedUrl,
  destroyWebview,
  listenBrowserUrlChanged,
  listenBrowserPageLoaded,
  injectAutofill,
  GRADING_SITE_PRESETS,
  captureWebviewScreenshot,
  captureWebviewArea,
  cropImageData,
} from './browser';

// ── Tests ────────────────────────────────────────────────────────────────

describe('browser.ts — Function exports', () => {
  it('exports all expected functions', () => {
    expect(typeof createEmbeddedBrowser).toBe('function');
    expect(typeof navigateEmbedded).toBe('function');
    expect(typeof goBack).toBe('function');
    expect(typeof goForward).toBe('function');
    expect(typeof reloadBrowser).toBe('function');
    expect(typeof setWebviewBounds).toBe('function');
    expect(typeof hideWebview).toBe('function');
    expect(typeof showWebview).toBe('function');
    expect(typeof getEmbeddedUrl).toBe('function');
    expect(typeof destroyWebview).toBe('function');
    expect(typeof listenBrowserUrlChanged).toBe('function');
    expect(typeof listenBrowserPageLoaded).toBe('function');
    expect(typeof injectAutofill).toBe('function');
  });

  it('exports GRADING_SITE_PRESETS array', () => {
    expect(Array.isArray(GRADING_SITE_PRESETS)).toBe(true);
    expect(GRADING_SITE_PRESETS.length).toBeGreaterThan(0);
    for (const preset of GRADING_SITE_PRESETS) {
      expect(preset.name).toBeTruthy();
      expect(preset.url).toBeTruthy();
    }
  });
});

describe('browser.ts — URL normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── createEmbeddedBrowser ────────────────────────────────────────────

  it('createEmbeddedBrowser adds https:// to bare domain', async () => {
    await createEmbeddedBrowser('example.com');
    expect(mockInvoke).toHaveBeenCalledWith('create_embedded_browser', {
      url: 'https://example.com',
    });
  });

  it('createEmbeddedBrowser keeps existing https://', async () => {
    await createEmbeddedBrowser('https://example.com');
    expect(mockInvoke).toHaveBeenCalledWith('create_embedded_browser', {
      url: 'https://example.com',
    });
  });

  it('createEmbeddedBrowser keeps existing http://', async () => {
    await createEmbeddedBrowser('http://example.com');
    expect(mockInvoke).toHaveBeenCalledWith('create_embedded_browser', {
      url: 'http://example.com',
    });
  });

  it('createEmbeddedBrowser trims whitespace', async () => {
    await createEmbeddedBrowser('  example.com  ');
    expect(mockInvoke).toHaveBeenCalledWith('create_embedded_browser', {
      url: 'https://example.com',
    });
  });

  // ── navigateEmbedded ────────────────────────────────────────────────

  it('navigateEmbedded adds https:// to bare domain', async () => {
    await navigateEmbedded('myopenmath.com');
    expect(mockInvoke).toHaveBeenCalledWith('navigate_embedded', {
      url: 'https://myopenmath.com',
    });
  });

  it('navigateEmbedded keeps existing https://', async () => {
    await navigateEmbedded('https://school.instructure.com/login');
    expect(mockInvoke).toHaveBeenCalledWith('navigate_embedded', {
      url: 'https://school.instructure.com/login',
    });
  });

  it('navigateEmbedded trims whitespace', async () => {
    await navigateEmbedded('  https://moodle.org  ');
    expect(mockInvoke).toHaveBeenCalledWith('navigate_embedded', {
      url: 'https://moodle.org',
    });
  });
});

describe('browser.ts — Navigation commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('goBack invokes the correct command', async () => {
    await goBack();
    expect(mockInvoke).toHaveBeenCalledWith('go_back');
  });

  it('goForward invokes the correct command', async () => {
    await goForward();
    expect(mockInvoke).toHaveBeenCalledWith('go_forward');
  });

  it('reloadBrowser invokes the correct command', async () => {
    await reloadBrowser();
    expect(mockInvoke).toHaveBeenCalledWith('reload_browser');
  });

  it('hideWebview invokes the correct command', async () => {
    await hideWebview();
    expect(mockInvoke).toHaveBeenCalledWith('hide_webview');
  });

  it('showWebview invokes the correct command', async () => {
    await showWebview();
    expect(mockInvoke).toHaveBeenCalledWith('show_webview');
  });

  it('destroyWebview invokes the correct command', async () => {
    await destroyWebview();
    expect(mockInvoke).toHaveBeenCalledWith('destroy_webview');
  });

  it('setWebviewBounds passes geometry parameters', async () => {
    await setWebviewBounds(10, 20, 800, 600);
    expect(mockInvoke).toHaveBeenCalledWith('set_webview_bounds', {
      x: 10,
      y: 20,
      width: 800,
      height: 600,
    });
  });

  it('getEmbeddedUrl invokes and returns result', async () => {
    mockInvoke.mockResolvedValueOnce('https://myopenmath.com/');
    const url = await getEmbeddedUrl();
    expect(url).toBe('https://myopenmath.com/');
    expect(mockInvoke).toHaveBeenCalledWith('get_embedded_url');
  });
});

describe('browser.ts — Event listeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listenBrowserUrlChanged registers listener', async () => {
    const cb = vi.fn();
    await listenBrowserUrlChanged(cb);
    expect(mockListen).toHaveBeenCalledWith('browser-url-changed', expect.any(Function));
  });

  it('listenBrowserPageLoaded registers listener', async () => {
    const cb = vi.fn();
    await listenBrowserPageLoaded(cb);
    expect(mockListen).toHaveBeenCalledWith('browser-page-loaded', expect.any(Function));
  });
});

describe('browser.ts — Autofill injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injectAutofill invokes inject_autofill with generated script', async () => {
    await injectAutofill('user', 'pass');
    expect(mockInvoke).toHaveBeenCalledWith('inject_autofill', {
      script: '/* mock script */',
    });
  });
});

// ── Screenshot Capture Tests ─────────────────────────────────────────────

describe('browser.ts — Screenshot capture exports', () => {
  it('exports captureWebviewScreenshot function', () => {
    expect(typeof captureWebviewScreenshot).toBe('function');
  });

  it('exports captureWebviewArea function', () => {
    expect(typeof captureWebviewArea).toBe('function');
  });

  it('exports cropImageData function', () => {
    expect(typeof cropImageData).toBe('function');
  });
});

describe('browser.ts — captureWebviewScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads html2canvas when not already present, then captures', async () => {
    // 1st invoke: evalScriptJSON checks typeof html2canvas → "false" (not loaded)
    mockInvoke.mockResolvedValueOnce('false');
    // 2nd invoke: evalScriptJSON loads html2canvas CDN → '"loaded"'
    mockInvoke.mockResolvedValueOnce('"loaded"');
    // 3rd invoke: evalScriptJSON captures screenshot → data URL
    mockInvoke.mockResolvedValueOnce('"data:image/jpeg;base64,abc123"');

    const result = await captureWebviewScreenshot();
    expect(result).toBe('data:image/jpeg;base64,abc123');
    expect(mockInvoke).toHaveBeenCalledTimes(3);

    // All three calls go through eval_webview_script
    for (let i = 0; i < 3; i++) {
      expect(mockInvoke.mock.calls[i][0]).toBe('eval_webview_script');
    }
  });

  it('skips CDN load when html2canvas is already present', async () => {
    // 1st invoke: html2canvas already loaded → "true"
    mockInvoke.mockResolvedValueOnce('true');
    // 2nd invoke: capture screenshot
    mockInvoke.mockResolvedValueOnce('"data:image/jpeg;base64,xyz789"');

    const result = await captureWebviewScreenshot();
    expect(result).toBe('data:image/jpeg;base64,xyz789');
    // Only 2 calls: check + capture (no CDN load)
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('throws when capture returns invalid data', async () => {
    mockInvoke.mockResolvedValueOnce('true');    // html2canvas present
    mockInvoke.mockResolvedValueOnce('""');       // empty string from capture

    await expect(captureWebviewScreenshot()).rejects.toThrow('invalid image data');
  });

  it('throws when capture returns null', async () => {
    mockInvoke.mockResolvedValueOnce('true');    // html2canvas present
    mockInvoke.mockResolvedValueOnce('null');     // null from capture

    await expect(captureWebviewScreenshot()).rejects.toThrow('invalid image data');
  });

  it('propagates CDN load errors', async () => {
    mockInvoke.mockResolvedValueOnce('false');   // not loaded
    mockInvoke.mockRejectedValueOnce(new Error('CDN unreachable'));

    await expect(captureWebviewScreenshot()).rejects.toThrow('CDN unreachable');
  });

  it('propagates webview eval errors (e.g. webview not open)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Embedded browser not open'));

    await expect(captureWebviewScreenshot()).rejects.toThrow('Embedded browser not open');
  });
});

describe('browser.ts — captureWebviewArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls captureWebviewScreenshot internally (verifies invoke chain)', async () => {
    // Mock the full chain: check + capture
    mockInvoke.mockResolvedValueOnce('true');
    mockInvoke.mockResolvedValueOnce('"data:image/jpeg;base64,fullpage"');

    // captureWebviewArea calls captureWebviewScreenshot then cropImageData.
    // cropImageData uses new Image() / canvas which don't exist in node env.
    // So we expect it to reject at the crop step.
    await expect(captureWebviewArea(10, 20, 100, 80)).rejects.toThrow();

    // But it should have called the webview eval first
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke.mock.calls[0][0]).toBe('eval_webview_script');
  });
});

describe('browser.ts — cropImageData', () => {
  it('rejects in node environment (no DOM Image/Canvas)', async () => {
    // cropImageData relies on new Image() + canvas - unavailable in node test env
    await expect(
      cropImageData('data:image/jpeg;base64,abc', 0, 0, 50, 50)
    ).rejects.toThrow();
  });
});
