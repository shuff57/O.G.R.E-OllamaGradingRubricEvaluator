import { contextBridge, ipcRenderer } from 'electron'

function invoke<T>(channel: string, args?: Record<string, unknown>): Promise<T> {
  return ipcRenderer.invoke(channel, args)
}

function listen(event: string, callback: (payload: unknown) => void): () => void {
  const handler = (_: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
  ipcRenderer.on(event, handler)
  return () => ipcRenderer.removeListener(event, handler)
}

contextBridge.exposeInMainWorld('electronAPI', {
  createEmbeddedBrowser: (tabId: string, url: string) => invoke('create_embedded_browser', { tabId, url }),
  navigateEmbedded: (tabId: string, url: string) => invoke('navigate_embedded', { tabId, url }),
  goBack: (tabId: string) => invoke('go_back', { tabId }),
  goForward: (tabId: string) => invoke('go_forward', { tabId }),
  reloadBrowser: (tabId: string) => invoke('reload_browser', { tabId }),
  setWebviewBounds: (tabId: string, x: number, y: number, width: number, height: number) =>
    invoke('set_webview_bounds', { tabId, x, y, width, height }),
  hideWebview: (tabId: string) => invoke('hide_webview', { tabId }),
  showWebview: (tabId: string) => invoke('show_webview', { tabId }),
  getEmbeddedUrl: (tabId: string) => invoke<string>('get_embedded_url', { tabId }),
  destroyWebview: (tabId: string) => invoke('destroy_webview', { tabId }),
  injectAutofill: (tabId: string, script: string) => invoke('inject_autofill', { tabId, script }),
  evalWebviewScript: (tabId: string, script: string) => invoke<string>('eval_webview_script', { tabId, script }),
  injectWebviewScript: (tabId: string, script: string) => invoke('inject_webview_script', { tabId, script }),

  scanLocalSkills: (dir: string) => invoke('scan_local_skills', { dir }),

  startOauthCallbackServer: (port: number) => invoke('start_oauth_callback_server', { port }),
  stopOauthCallbackServer: () => invoke('stop_oauth_callback_server'),

  getCdpPort: () => invoke<number | null>('get_cdp_port'),
  discoverCdpTarget: (port: number) => invoke<string | null>('discover_cdp_target', { port }),
  captureAccessibilityTree: (tabId: string) => invoke<string>('capture_accessibility_tree', { tabId }),
  cdpAttach: (tabId: string) => invoke('cdp_attach', { tabId }),
  cdpSend: (tabId: string, method: string, params?: Record<string, unknown>) => invoke('cdp_send', { tabId, method, params }),

  dbQuery: (sql: string, params?: unknown[]) => invoke('db_query', { sql, params }),
  dbExecute: (sql: string, params?: unknown[]) => invoke('db_execute', { sql, params }),

  updaterDownload: () => invoke('updater:download'),
  updaterInstall: () => invoke('updater:install'),

  on: listen,
  emit: (event: string, payload: unknown) => ipcRenderer.send(event, payload),
  invoke: (channel: string, args?: Record<string, unknown>) => ipcRenderer.invoke(channel, args),
})
