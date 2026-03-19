import { BrowserWindow, WebContentsView, ipcMain, app } from 'electron'
import path from 'node:path'

interface TabEntry {
  view: WebContentsView
  url: string
  visible: boolean
}

const tabs = new Map<string, TabEntry>()

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function emit(event: string, payload: unknown): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) win.webContents.send(event, payload)
}

function getTab(tabId: string): TabEntry {
  const entry = tabs.get(tabId)
  if (!entry) throw new Error(`Tab ${tabId} not found`)
  return entry
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return 'https://' + trimmed
}

export function createBrowserView(tabId: string, url: string): void {
  const win = getMainWindow()
  if (!win) {
    emit('browser-status', 'error')
    return
  }

  if (tabs.has(tabId)) destroyBrowserView(tabId)

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.contentView.addChildView(view)

  const normalizedUrl = normalizeUrl(url)

  view.webContents.on('did-navigate', (_e, navUrl) => {
    const entry = tabs.get(tabId)
    if (entry) entry.url = navUrl
    emit('browser-url-changed', { tabId, url: navUrl })
  })

  view.webContents.on('did-finish-load', () => {
    const currentUrl = view.webContents.getURL()
    const entry = tabs.get(tabId)
    if (entry) entry.url = currentUrl
    emit('browser-page-loaded', { tabId, url: currentUrl })
  })

  view.webContents.on('will-navigate', (_e, navUrl) => {
    emit('browser-url-changed', { tabId, url: navUrl })
  })

  view.webContents.setWindowOpenHandler(({ url: newUrl }) => {
    view.webContents.loadURL(normalizeUrl(newUrl)).catch(() => {})
    return { action: 'deny' }
  })

  tabs.set(tabId, { view, url: normalizedUrl, visible: true })

  view.webContents.loadURL(normalizedUrl).then(() => {
    emit('browser-status', 'embedded-open')
  }).catch((e: Error) => {
    emit('browser-status', 'error')
    emit('browser-log', `Load failed: ${e.message}`)
  })
}

export function navigateBrowserView(tabId: string, url: string): void {
  const entry = getTab(tabId)
  const normalized = normalizeUrl(url)
  entry.view.webContents.loadURL(normalized).catch(() => {})
}

export function goBack(tabId: string): void {
  getTab(tabId).view.webContents.goBack()
}

export function goForward(tabId: string): void {
  getTab(tabId).view.webContents.goForward()
}

export function reloadBrowserView(tabId: string): void {
  getTab(tabId).view.webContents.reload()
}

export function setViewBounds(tabId: string, x: number, y: number, width: number, height: number): void {
  getTab(tabId).view.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
}

export function hideView(tabId: string): void {
  const entry = getTab(tabId)
  entry.view.setVisible(false)
  entry.visible = false
}

export function showView(tabId: string): void {
  const entry = getTab(tabId)
  entry.view.setVisible(true)
  entry.visible = true
}

export function getViewUrl(tabId: string): string {
  const entry = tabs.get(tabId)
  if (!entry) return ''
  return entry.view.webContents.getURL() || entry.url
}

export function destroyBrowserView(tabId: string): void {
  const entry = tabs.get(tabId)
  if (!entry) return
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    try { win.contentView.removeChildView(entry.view) } catch { /* already removed */ }
  }
  try { entry.view.webContents.close() } catch { /* already closed */ }
  tabs.delete(tabId)
}

export function getViewWebContents(tabId: string): Electron.WebContents | null {
  return tabs.get(tabId)?.view.webContents ?? null
}

export function registerBrowserHandlers(): void {
  ipcMain.handle('create_embedded_browser', (_e, { tabId, url }: { tabId: string; url: string }) => {
    createBrowserView(tabId, url)
  })
  ipcMain.handle('navigate_embedded', (_e, { tabId, url }: { tabId: string; url: string }) => {
    navigateBrowserView(tabId, url)
  })
  ipcMain.handle('go_back', (_e, { tabId }: { tabId: string }) => {
    goBack(tabId)
  })
  ipcMain.handle('go_forward', (_e, { tabId }: { tabId: string }) => {
    goForward(tabId)
  })
  ipcMain.handle('reload_browser', (_e, { tabId }: { tabId: string }) => {
    reloadBrowserView(tabId)
  })
  ipcMain.handle('set_webview_bounds', (_e, { tabId, x, y, width, height }: { tabId: string; x: number; y: number; width: number; height: number }) => {
    setViewBounds(tabId, x, y, width, height)
  })
  ipcMain.handle('hide_webview', (_e, { tabId }: { tabId: string }) => {
    hideView(tabId)
  })
  ipcMain.handle('show_webview', (_e, { tabId }: { tabId: string }) => {
    showView(tabId)
  })
  ipcMain.handle('get_embedded_url', (_e, { tabId }: { tabId: string }) => {
    return getViewUrl(tabId)
  })
  ipcMain.handle('destroy_webview', (_e, { tabId }: { tabId: string }) => {
    destroyBrowserView(tabId)
  })
  ipcMain.handle('inject_autofill', (_e, { tabId, script }: { tabId: string; script: string }) => {
    const wc = getViewWebContents(tabId)
    if (wc) return wc.executeJavaScript(script, true)
  })
  ipcMain.handle('eval_webview_script', (_e, { tabId, script }: { tabId: string; script: string }) => {
    const wc = getViewWebContents(tabId)
    if (!wc) throw new Error(`Tab ${tabId} not found`)
    return wc.executeJavaScript(script, true)
  })
  ipcMain.handle('inject_webview_script', (_e, { tabId, script }: { tabId: string; script: string }) => {
    const wc = getViewWebContents(tabId)
    if (!wc) throw new Error(`Tab ${tabId} not found`)
    return wc.executeJavaScript(script, false)
  })
}
