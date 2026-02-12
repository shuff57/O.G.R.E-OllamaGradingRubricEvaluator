import { listen } from '@tauri-apps/api/event';

export type ServerStatus = 'running' | 'stopped' | 'crashed' | 'failed';

/**
 * Listen for real-time log lines from the grading server sidecar.
 * Returns an unlisten function to stop listening.
 */
export function listenServerLogs(callback: (line: string) => void) {
  return listen<string>('server-log', (event) => callback(event.payload));
}

/**
 * Listen for server status changes (running/stopped/crashed/failed).
 * Returns an unlisten function to stop listening.
 */
export function listenServerStatus(callback: (status: ServerStatus) => void) {
  return listen<ServerStatus>('server-status', (event) => callback(event.payload));
}
