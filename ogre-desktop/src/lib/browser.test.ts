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
