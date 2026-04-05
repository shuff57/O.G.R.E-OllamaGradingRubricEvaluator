/**
 * cdp-client.ts — Thin CDP WebSocket client for the Tauri frontend.
 *
 * Zero npm dependencies — uses browser-native WebSocket and fetch only.
 * Connects to the WebView2 CDP endpoint, discovers the embedded browser target,
 * and provides JSON-RPC messaging + event subscription over WebSocket.
 */

export interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

type EventCallback = (params: Record<string, unknown>) => void;

/** URL patterns that identify the main Electron app webview (not the embedded browser). */
export const MAIN_APP_PATTERNS = [
  /^http:\/\/localhost:(1420|5173)/, // Vite dev server
  /^file:\/\//, // Production — Electron loads dist/index.html
  /^devtools:\/\//,
  /^chrome-extension:\/\//,
];

const SEND_TIMEOUT_MS = 90_000;

export class CDPClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private listeners = new Map<string, Set<EventCallback>>();
  private connected = false;

  /**
   * Connect to the embedded browser via CDP.
   * Fetches targets from http://127.0.0.1:{port}/json, filters to find the
   * embedded browser page, and opens a WebSocket to its debugger URL.
   * @returns true on success, false on any failure (NEVER throws)
   */
  async connect(port: number = 9222): Promise<boolean> {
    try {
      if (this.ws) await this.disconnect();

      // Use 127.0.0.1 not localhost (IPv4 vs IPv6 gotcha on Windows/WebView2)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(`http://127.0.0.1:${port}/json`, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) return false;

      const targets: CDPTarget[] = await resp.json();
      const target = targets.find(
        (t) =>
          t.type === 'page' &&
          t.url !== 'about:blank' &&
          t.url !== '' &&
          !MAIN_APP_PATTERNS.some((p) => p.test(t.url)),
      );
      if (!target?.webSocketDebuggerUrl) return false;

      return await this.openWebSocket(target.webSocketDebuggerUrl);
    } catch {
      return false;
    }
  }

  /**
   * Connect to a CDP target using a known WebSocket URL.
   * Skips HTTP discovery — use when the wsUrl was resolved externally (e.g. via Rust proxy).
   * @returns true on success, false on any failure (NEVER throws)
   */
  async connectToUrl(wsUrl: string): Promise<boolean> {
    try {
      if (this.ws) await this.disconnect();
      const ok = await this.openWebSocket(wsUrl);
      if (!ok) return false;
      await this.send('Page.enable');
      return true;
    } catch {
      return false;
    }
  }

  /** Disconnect from CDP and clean up all state. Safe to call when not connected. */
  async disconnect(): Promise<void> {
    this.connected = false;

    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Disconnected'));
    }
    this.pending.clear();

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch { /* ignore */ }
      this.ws = null;
    }
  }

  /** Returns true if WebSocket is open and target is attached. */
  isConnected(): boolean {
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Send a CDP method call and wait for the response.
   * @throws If not connected, on timeout (30s), or if CDP returns an error
   */
  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Not connected to CDP'));
    }

    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method} (${SEND_TIMEOUT_MS}ms)`));
      }, SEND_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(message);
    });
  }

  /** Subscribe to a CDP event (e.g. 'Network.requestWillBeSent'). */
  on(event: string, callback: EventCallback): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);
  }

  /** Unsubscribe from a CDP event. */
  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private openWebSocket(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url);
        const timeout = setTimeout(() => { try { ws.close(); } catch {} resolve(false); }, 5000);
        ws.onopen = () => { clearTimeout(timeout); this.ws = ws; this.connected = true; resolve(true); };
        ws.onerror = () => { clearTimeout(timeout); resolve(false); };
        ws.onclose = () => { this.connected = false; };
        ws.onmessage = (ev: MessageEvent) => { this.handleMessage(ev); };
      } catch {
        resolve(false);
      }
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(String(event.data)) as {
        id?: number;
        method?: string;
        result?: unknown;
        error?: { code: number; message: string };
        params?: Record<string, unknown>;
      };

      // Response to a pending request (has `id`)
      if (msg.id !== undefined) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          clearTimeout(entry.timer);
          if (msg.error) {
            entry.reject(new Error(`CDP error ${msg.error.code}: ${msg.error.message}`));
          } else {
            entry.resolve(msg.result);
          }
        }
        return;
      }

      // Event (has `method`, no `id`) — dispatch to listeners
      if (msg.method) {
        const callbacks = this.listeners.get(msg.method);
        if (callbacks) {
          for (const cb of callbacks) {
            try { cb(msg.params ?? {}); } catch { /* listener errors don't break loop */ }
          }
        }
      }
    } catch { /* ignore malformed messages */ }
  }
}

export const cdp = new CDPClient();
