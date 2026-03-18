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

export function listenForUpdateStatus(callback: UpdateStatusCallback): UnlistenFn {
  const api = getElectronUpdaterAPI()
  return api.on('update-status', (payload) => callback(payload as UpdateStatusPayload))
}

export async function downloadUpdate(): Promise<void> {
  const api = getElectronUpdaterAPI()
  await api.invoke('updater:download')
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  return { available: false }
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
