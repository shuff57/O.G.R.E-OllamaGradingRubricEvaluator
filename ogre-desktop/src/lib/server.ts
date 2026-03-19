import { listen } from './electron-bridge';
;
import { getHandshakeToken } from './provider-sync';
import type { SiteProfile } from './batch-grader';

export type ServerStatus = 'running' | 'stopped' | 'crashed' | 'failed';

/** Shape of the session_complete payload emitted from the grading server child process. */
export interface SessionCompletePayload {
  type: 'session_complete';
  provider_id: string;
  model: string;
  student_count: number;
  mean_score: number;
  min_score: number;
  max_score: number;
  median_score: number;
  max_possible_score: number;
  page_url: string;
  question_id: string;
  custom_instructions: string;
}

/** Shape of the provider_changed payload from the grading server. */
export interface ProviderChangedPayload {
  provider_id: string;
  model: string;
}

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

/**
 * Listen for session-complete events emitted by the grading server child process
 * when POST /session data is captured from stdout.
 * The Rust side already inserts into SQLite — this is for UI refresh.
 * Returns an unlisten function.
 */
export function listenSessionComplete(callback: (session: SessionCompletePayload) => void) {
  return listen<SessionCompletePayload>('session-complete', (event) => callback(event.payload));
}

/**
 * Listen for provider-changed events from the grading server
 * (desktop app POSTs active provider selection to /api/providers/active,
 * server writes to stdout, Rust parses and emits Tauri event).
 * Returns an unlisten function.
 */
export function listenProviderChanged(callback: (data: ProviderChangedPayload) => void) {
  return listen<ProviderChangedPayload>('provider-changed', (event) => callback(event.payload));
}

// ── Profile Sync (Desktop → Grading Server) ───────────────────────────

const SERVER_BASE = 'http://localhost:3456';

/**
 * Sync a site profile to the grading server's in-memory cache.
 * Fire-and-forget: errors are silently swallowed so profile saves
 * are never blocked by server availability.
 */
export async function syncProfileToServer(profile: SiteProfile): Promise<void> {
  try {
    const token = getHandshakeToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    await fetch(`${SERVER_BASE}/api/profiles/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify(profile),
    });
  } catch {
    // Silently swallow — server may not be running
  }
}
