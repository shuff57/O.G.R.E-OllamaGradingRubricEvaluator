/**
 * Config file management for the O.G.R.E grading server.
 *
 * Reads/writes provider configs and auth token from a JSON file on disk.
 * Location: OGRE_CONFIG_DIR env var || platform-specific app data dir.
 *
 * The desktop app writes this file when settings change.
 * The server reads it on startup and watches for changes.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, watchFile, unwatchFile } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const CONFIG_FILENAME = 'ogre-server.json';

/**
 * Resolve the config directory path.
 * Priority: OGRE_CONFIG_DIR env var > platform default.
 */
export function getConfigDir() {
  if (process.env.OGRE_CONFIG_DIR) return process.env.OGRE_CONFIG_DIR;

  const platform = process.platform;
  if (platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'ogre-desktop');
  } else if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'ogre-desktop');
  } else {
    return join(homedir(), '.config', 'ogre-desktop');
  }
}

/**
 * Full path to the config file.
 */
export function getConfigPath() {
  return join(getConfigDir(), CONFIG_FILENAME);
}

/**
 * Default config structure.
 */
function createDefaultConfig() {
  return {
    token: randomUUID(),
    providers: [],
  };
}

/**
 * Load config from disk. Creates a default config file if missing.
 * @returns {{ token: string, providers: Array }} Config object
 */
export function loadConfig() {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    const dir = getConfigDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const defaults = createDefaultConfig();
    writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
    // Merge cloud provider from env vars if configured
    mergeCloudProviderFromEnv(defaults);
    return defaults;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);

    // Ensure required fields exist
    if (!config.token) config.token = randomUUID();
    if (!Array.isArray(config.providers)) config.providers = [];

    // Merge cloud provider from env vars if configured
    mergeCloudProviderFromEnv(config);

    return config;
  } catch (err) {
    console.error(`[config] Failed to parse ${configPath}: ${err.message}. Using defaults.`);
    const defaults = createDefaultConfig();
    // Overwrite corrupt file
    writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
    // Merge cloud provider from env vars if configured
    mergeCloudProviderFromEnv(defaults);
    return defaults;
  }
}

/**
 * Save config to disk atomically (write to .tmp, then rename).
 * @param {{ token: string, providers: Array }} config
 */
export function saveConfig(config) {
  const configPath = getConfigPath();
  const tmpPath = configPath + '.tmp';
  const dir = getConfigDir();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  renameSync(tmpPath, configPath);
}

/**
 * Watch the config file for external changes (e.g., desktop app writes).
 * Calls the callback with the new config when the file changes.
 * Debounced to 500ms to avoid duplicate events.
 *
 * @param {function} callback - Called with (newConfig) on file change
 * @returns {function} Stop function to unwatch
 */
export function watchConfig(callback) {
   const configPath = getConfigPath();
   let debounceTimer = null;

   watchFile(configPath, { interval: 1000 }, () => {
     if (debounceTimer) clearTimeout(debounceTimer);
     debounceTimer = setTimeout(() => {
       try {
         const newConfig = loadConfig();
         callback(newConfig);
       } catch (err) {
         console.error(`[config] Watch reload failed: ${err.message}`);
       }
     }, 500);
   });

   return () => {
     if (debounceTimer) clearTimeout(debounceTimer);
     unwatchFile(configPath);
   };
}

/**
 * Merge cloud provider from environment variables if configured.
 * If OGRE_RUNPOD_ENDPOINT_ID and OGRE_RUNPOD_API_KEY are set,
 * adds an ollama-cloud provider to the config if not already present.
 */
function mergeCloudProviderFromEnv(config) {
  const runpodEndpointId = process.env.OGRE_RUNPOD_ENDPOINT_ID;
  const runpodApiKey = process.env.OGRE_RUNPOD_API_KEY;
  if (runpodEndpointId && runpodApiKey) {
    const hasCloud = config.providers.some(p => p.id === 'ollama-cloud');
    if (!hasCloud) {
      config.providers.push({
        id: 'ollama-cloud',
        api_url: `https://api.runpod.ai/v2/${runpodEndpointId}`,
        model: 'qwen3.5-9B-stat-grader',
        credentials: { api_key: runpodApiKey, endpoint_id: runpodEndpointId }
      });
    }
  }
}
