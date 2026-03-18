import { ipcMain, app } from 'electron'
import { getViewWebContents } from './browser-manager'
import fs from 'node:fs'
import path from 'node:path'

const CDP_PORT_FILE = path.join(app.getPath('userData'), '.cdp-port')

let cdpPort: number | null = null

export function getCdpPort(): number | null {
  return cdpPort
}

export function setCdpPort(port: number): void {
  cdpPort = port
  try {
    fs.mkdirSync(path.dirname(CDP_PORT_FILE), { recursive: true })
    fs.writeFileSync(CDP_PORT_FILE, String(port))
  } catch { /* non-critical */ }
}

const attachedTabs = new Set<string>()

export function attachDebugger(tabId: string): void {
  const wc = getViewWebContents(tabId)
  if (!wc || attachedTabs.has(tabId)) return
  try {
    wc.debugger.attach('1.3')
    attachedTabs.add(tabId)
    wc.debugger.sendCommand('Page.enable').catch(() => {})
    wc.debugger.sendCommand('Runtime.enable').catch(() => {})
    wc.debugger.sendCommand('DOM.enable').catch(() => {})
    wc.debugger.sendCommand('Accessibility.enable').catch(() => {})
  } catch { /* already attached */ }

  wc.debugger.on('message', (_event: Electron.Event, method: string, params: unknown) => {
    const win = wc.getOwnerBrowserWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('cdp-event', { tabId, method, params })
    }
  })

  wc.on('destroyed', () => {
    attachedTabs.delete(tabId)
  })
}

export function detachDebugger(tabId: string): void {
  const wc = getViewWebContents(tabId)
  if (!wc || !attachedTabs.has(tabId)) return
  try { wc.debugger.detach() } catch { /* ignore */ }
  attachedTabs.delete(tabId)
}

interface AXNode {
  nodeId: string
  role?: { value?: string }
  name?: { value?: string }
  value?: { value?: unknown }
  description?: { value?: string }
  properties?: Array<{ name: string; value?: { value?: unknown } }>
  childIds?: string[]
  backendDOMNodeId?: number
}

function formatAXTree(nodes: AXNode[]): string {
  if (!nodes || nodes.length === 0) return ''
  const byId = new Map<string, AXNode>()
  for (const n of nodes) byId.set(n.nodeId, n)

  const rootNodes = nodes.filter((n) => {
    const role = n.role?.value ?? ''
    return role === 'WebArea' || role === 'RootWebArea'
  })
  const roots = rootNodes.length > 0 ? rootNodes : nodes.slice(0, 1)

  const SKIP_ROLES = new Set(['none', 'presentation', 'InlineTextBox'])
  const lines: string[] = []

  function walk(node: AXNode, depth: number): void {
    const role = node.role?.value ?? 'unknown'
    if (SKIP_ROLES.has(role)) {
      for (const childId of node.childIds ?? []) {
        const child = byId.get(childId)
        if (child) walk(child, depth)
      }
      return
    }

    const name = node.name?.value ? ` "${String(node.name.value).trim()}"` : ''
    const val = node.value?.value !== undefined ? ` value="${String(node.value.value)}"` : ''
    const indent = '  '.repeat(depth)
    const locator = node.backendDOMNodeId ? ` [DOM=${node.backendDOMNodeId}]` : ''
    lines.push(`${indent}- ${role}${name}${val}${locator}`)

    for (const childId of node.childIds ?? []) {
      const child = byId.get(childId)
      if (child) walk(child, depth + 1)
    }
  }

  for (const root of roots) walk(root, 0)
  return lines.join('\n')
}

export async function captureAccessibilityTree(tabId: string): Promise<string> {
  const wc = getViewWebContents(tabId)
  if (!wc) throw new Error(`Tab ${tabId} not found`)
  if (!attachedTabs.has(tabId)) attachDebugger(tabId)
  await wc.debugger.sendCommand('Accessibility.enable')
  const result = await wc.debugger.sendCommand('Accessibility.getFullAXTree') as { nodes?: AXNode[] }
  return formatAXTree(result.nodes ?? [])
}

export function registerCdpHandlers(): void {
  ipcMain.handle('cdp_attach', (_e, { tabId }: { tabId: string }) => {
    attachDebugger(tabId)
  })

  ipcMain.handle('cdp_detach', (_e, { tabId }: { tabId: string }) => {
    detachDebugger(tabId)
  })

  ipcMain.handle('cdp_send', async (_e, { tabId, method, params }: { tabId: string; method: string; params?: Record<string, unknown> }) => {
    const wc = getViewWebContents(tabId)
    if (!wc) throw new Error(`Tab ${tabId} not found`)
    if (!attachedTabs.has(tabId)) attachDebugger(tabId)
    return wc.debugger.sendCommand(method, params)
  })

  ipcMain.handle('capture_accessibility_tree', async (_e, { tabId }: { tabId: string }) => {
    return captureAccessibilityTree(tabId)
  })

  ipcMain.handle('get_cdp_port', () => {
    return cdpPort
  })

  ipcMain.handle('discover_cdp_target', async (_e, { port }: { port: number }) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`)
      if (!res.ok) return null
      const targets = await res.json() as Array<{ type: string; url: string; webSocketDebuggerUrl?: string }>
      const MAIN_APP_PATTERNS = [
        /^devtools:\/\//,
        /^chrome-extension:\/\//,
        /^http:\/\/localhost:(1420|5173)/,
      ]
      const target = targets.find(
        (t) => t.type === 'page' &&
          t.url !== 'about:blank' &&
          t.url !== '' &&
          !MAIN_APP_PATTERNS.some((p) => p.test(t.url))
      )
      return target?.webSocketDebuggerUrl ?? null
    } catch {
      return null
    }
  })
}
