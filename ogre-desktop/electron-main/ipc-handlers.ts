import { ipcMain, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { registerDatabaseHandlers } from './database'
import { registerBrowserHandlers } from './browser-manager'
import { registerCdpHandlers } from './cdp-bridge'
import { registerOAuthHandlers } from './oauth-server'

export function registerIpcHandlers(): void {
  registerDatabaseHandlers()
  registerBrowserHandlers()
  registerCdpHandlers()
  registerOAuthHandlers()

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
}
