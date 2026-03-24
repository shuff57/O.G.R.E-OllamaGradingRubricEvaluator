import { ipcMain, net } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { autoUpdater } from 'electron-updater'
import { registerDatabaseHandlers } from './database'
import { registerBrowserHandlers } from './browser-manager'
import { registerCdpHandlers } from './cdp-bridge'
import { registerOAuthHandlers } from './oauth-server'

export function registerIpcHandlers(): void {
  registerDatabaseHandlers()
  registerBrowserHandlers()
  registerCdpHandlers()
  registerOAuthHandlers()

  // Proxy HTTP requests through the main process so the renderer can reach
  // endpoints (e.g. Anthropic token exchange) that block CORS from a
  // localhost/file:// origin.
  ipcMain.handle('oauth:fetch', async (_e, {
    url,
    method = 'POST',
    headers = {},
    body,
  }: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: string
  }) => {
    const res = await net.fetch(url, {
      method,
      headers,
      body: body ?? undefined,
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, body: text }
  })

  ipcMain.handle('scan_local_skills', async (_e, { dir }: { dir: string }) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => {
          const skillMd = path.join(dir, e.name, 'SKILL.md')
          const content = fs.existsSync(skillMd) ? fs.readFileSync(skillMd, 'utf-8') : ''
          return { name: e.name, path: path.join(dir, e.name), content }
        })
    } catch {
      return []
    }
  })

  ipcMain.handle('updater:check', async () => {
    try {
      return await autoUpdater.checkForUpdates()
    } catch {
      return null
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      return await autoUpdater.downloadUpdate()
    } catch {
      return null
    }
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })
}
