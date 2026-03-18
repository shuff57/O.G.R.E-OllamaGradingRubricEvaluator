import type { BrowserWindow } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateDownloadedEvent } from 'electron-updater'

let updaterInitialized = false
let activeWindow: BrowserWindow | null = null

function sendStatus(payload: Record<string, unknown>): void {
  if (!activeWindow || activeWindow.isDestroyed()) return
  activeWindow.webContents.send('update-status', payload)
}

function formatReleaseNotes(releaseNotes: unknown): string | undefined {
  if (!releaseNotes) return undefined
  if (typeof releaseNotes === 'string') return releaseNotes
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const noteRecord = item as { note?: unknown; version?: unknown }
        const note = typeof noteRecord.note === 'string' ? noteRecord.note : ''
        const version = typeof noteRecord.version === 'string' ? noteRecord.version : ''
        if (version && note) return `v${version}\n${note}`
        return note
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return undefined
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  activeWindow = mainWindow
  if (updaterInitialized) return
  updaterInitialized = true

  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', (info) => {
    sendStatus({
      type: 'update-available',
      version: info.version,
      notes: formatReleaseNotes(info.releaseNotes),
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    sendStatus({
      type: 'update-not-available',
      version: info.version,
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    sendStatus({
      type: 'update-progress',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
    sendStatus({
      type: 'update-ready',
      version: info.version,
      notes: formatReleaseNotes(info.releaseNotes),
    })
  })

  autoUpdater.on('error', (error) => {
    sendStatus({
      type: 'error',
      message: error?.message ?? 'Unknown updater error',
    })
  })

  try {
    void autoUpdater.checkForUpdates().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      sendStatus({
        type: 'error',
        message,
      })
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    sendStatus({
      type: 'error',
      message,
    })
  }
}
