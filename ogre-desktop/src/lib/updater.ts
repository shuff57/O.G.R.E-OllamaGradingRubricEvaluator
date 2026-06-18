type UnlistenFn = () => void

type ElectronUpdaterAPI = {
  invoke: (channel: string, args?: Record<string, unknown>) => Promise<unknown>
  on: (event: string, callback: (payload: unknown) => void) => UnlistenFn
}

type UpdateAvailablePayload = {
  type: 'update-available'
  version?: string
  notes?: string
}

type UpdateProgressPayload = {
  type: 'update-progress'
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
}

type UpdateReadyPayload = {
  type: 'update-ready'
  version?: string
  notes?: string
}

type UpdateNotAvailablePayload = {
  type: 'update-not-available'
  version?: string
}

type UpdateErrorPayload = {
  type: 'error'
  message?: string
}

export type UpdateStatusPayload =
  | UpdateAvailablePayload
  | UpdateProgressPayload
  | UpdateReadyPayload
  | UpdateNotAvailablePayload
  | UpdateErrorPayload

type UpdateStatusCallback = (payload: UpdateStatusPayload) => void

export interface Update {
  version: string
  body?: string | null
  download: () => Promise<void>
  installAndRelaunch: () => Promise<void>
}

export interface UpdateCheckResult {
  available: boolean
  version?: string
  notes?: string
  update?: Update
}

export interface DownloadProgress {
  percent: number
  total?: number
  downloaded: number
}

function getElectronUpdaterAPI(): ElectronUpdaterAPI {
  const api = (window as unknown as { electronAPI?: ElectronUpdaterAPI }).electronAPI
  if (!api) {
    throw new Error('electronAPI updater bridge is unavailable')
  }
  return api
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const api = getElectronUpdaterAPI()
  return new Promise<UpdateCheckResult>((resolve) => {
    const unlisten = api.on('update-status', (payload) => {
      const p = payload as UpdateStatusPayload
      if (p.type === 'update-available') {
        unlisten()
        resolve({
          available: true,
          version: p.version,
          notes: p.notes,
          update: {
            version: p.version ?? '',
            body: p.notes ?? null,
            download: async () => { await api.invoke('updater:download') },
            installAndRelaunch: async () => { await api.invoke('updater:install') },
          },
        })
      } else if (p.type === 'update-not-available' || p.type === 'error') {
        unlisten()
        resolve({ available: false })
      }
    })
    // Trigger the check; main process will emit update-status events in response
    void api.invoke('updater:check').catch(() => {
      unlisten()
      resolve({ available: false })
    })
  })
}

export async function installUpdate(
  update?: Update,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  if (!update) {
    const api = getElectronUpdaterAPI()
    await api.invoke('updater:install')
    return
  }

  await update.download()
  onProgress?.({ percent: 100, downloaded: 0 })
  await update.installAndRelaunch()
}
