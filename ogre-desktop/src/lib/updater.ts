import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  notes?: string;
  update?: Update;
}

export interface DownloadProgress {
  /** 0-100 percent */
  percent: number;
  /** Total bytes expected (if known) */
  total?: number;
  /** Bytes downloaded so far */
  downloaded: number;
}

/**
 * Check GitHub Releases for a newer version.
 * Returns update metadata if available, or { available: false }.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const update = await check();

    if (update) {
      console.log(`[updater] Update available: v${update.version}`);
      return {
        available: true,
        version: update.version,
        notes: update.body ?? undefined,
        update,
      };
    }

    console.log('[updater] Current version is the latest.');
    return { available: false };
  } catch (err) {
    // Network errors, rate limits, no releases yet — all acceptable
    console.warn('[updater] Update check failed (non-fatal):', err);
    return { available: false };
  }
}

/**
 * Download, install, and relaunch the app.
 * Calls `onProgress` during download so callers can drive a progress bar.
 */
export async function installUpdate(
  update: Update,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength: number | undefined;

  await update.downloadAndInstall((event) => {
    if (event.event === 'Started' && event.data.contentLength) {
      contentLength = event.data.contentLength;
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      const percent = contentLength
        ? Math.min(100, Math.round((downloaded / contentLength) * 100))
        : 0;
      onProgress?.({ percent, total: contentLength, downloaded });
    } else if (event.event === 'Finished') {
      onProgress?.({ percent: 100, total: contentLength, downloaded });
    }
  });

  // Relaunch into the new version
  await relaunch();
}
