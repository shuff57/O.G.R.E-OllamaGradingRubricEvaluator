/**
 * providers.js - Multi-provider adapter module
 *
 * Supports 4 AI providers with normalized interfaces:
 *   - ollama-cloud:   User-provided Ollama Cloud endpoint
 *   - ollama-local:   Local Ollama at localhost:11434
 *   - openai:         OpenAI API
 *   - github-models:  GitHub Models (Azure-backed)
 *
 * Each provider exposes:
 *   getConfig()                        -> { id, name, fields[] }
 *   listModels(config)                 -> Promise<[{ id, name }]>
 *   testConnection(config)             -> Promise<{ ok, error? }>
 *   buildChatRequest(config, messages, options) -> { url, headers, body }
 */

// ---------------------------------------------------------------------------
// Helper: fetch via background service worker proxy (avoids CORS in sidepanel)
// ---------------------------------------------------------------------------
function proxyFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      reject(new Error('Extension API not available'));
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, 130000);

    chrome.runtime.sendMessage(
      { action: 'proxyFetch', url, options },
      (response) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response) {
          reject(new Error('No response from background service worker'));
        } else if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve({
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            text: () => Promise.resolve(response.data),
            json: () => Promise.resolve(JSON.parse(response.data)),
          });
        }
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Helper: normalise a base URL (strip trailing slash and /api suffix)
// ---------------------------------------------------------------------------
function normalizeBaseUrl(url) {
  let u = (url || '').replace(/\/+$/, '');
  if (u.endsWith('/api')) u = u.slice(0, -4);
  return u;
}

// ---------------------------------------------------------------------------
// Provider: Ollama Cloud
// ---------------------------------------------------------------------------
const ollamaCloud = {
  getConfig() {
    return {
      id: 'ollama-cloud',
      name: 'Ollama Cloud',
      fields: [
        { key: 'apiUrl', label: 'API URL', type: 'text', required: true, placeholder: 'https://api.ollama.com' },
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
      ],
    };
  },

  async listModels(config) {
    const base = normalizeBaseUrl(config.apiUrl);
    const headers = {};
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const res = await proxyFetch(`${base}/api/tags`, { headers });
    if (!res.ok) throw new Error(`Failed to list models: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return (data.models || []).map((m) => ({ id: m.name || m.model, name: m.name || m.model }));
  },

  async testConnection(config) {
    try {
      const base = normalizeBaseUrl(config.apiUrl);
      const headers = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const res = await proxyFetch(`${base}/api/tags`, { headers });
      if (res.ok) return { ok: true };
      if (res.status === 401) return { ok: false, error: '401 Unauthorized. Check your API Key.' };
      return { ok: false, error: `${res.status} ${res.statusText}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  buildChatRequest(config, messages, options = {}) {
    const base = normalizeBaseUrl(config.apiUrl);
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const body = {
      model: config.model,
      messages,
      stream: options.stream ?? true,
      options: options.modelOptions || {},
    };

    return { url: `${base}/api/chat`, headers, body };
  },
};

// ---------------------------------------------------------------------------
// Provider: Ollama Local
// ---------------------------------------------------------------------------
const ollamaLocal = {
  getConfig() {
    return {
      id: 'ollama-local',
      name: 'Ollama Local',
      fields: [
        { key: 'apiUrl', label: 'API URL', type: 'text', required: false, placeholder: 'http://localhost:11434', default: 'http://localhost:11434' },
      ],
    };
  },

  async listModels(config) {
    const base = normalizeBaseUrl(config.apiUrl || 'http://localhost:11434');
    const res = await proxyFetch(`${base}/api/tags`, {});
    if (!res.ok) throw new Error(`Failed to list models: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return (data.models || []).map((m) => ({ id: m.name || m.model, name: m.name || m.model }));
  },

  async testConnection(config) {
    try {
      const base = normalizeBaseUrl(config.apiUrl || 'http://localhost:11434');
      const res = await proxyFetch(`${base}/api/tags`, {});
      if (res.ok) return { ok: true };
      return { ok: false, error: `${res.status} ${res.statusText}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  buildChatRequest(config, messages, options = {}) {
    const base = normalizeBaseUrl(config.apiUrl || 'http://localhost:11434');
    const headers = { 'Content-Type': 'application/json' };

    const body = {
      model: config.model,
      messages,
      stream: options.stream ?? true,
      options: options.modelOptions || {},
    };

    return { url: `${base}/api/chat`, headers, body };
  },
};

// ---------------------------------------------------------------------------
// Provider: OpenAI
// ---------------------------------------------------------------------------
const openai = {
  getConfig() {
    return {
      id: 'openai',
      name: 'OpenAI',
      fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-...' },
      ],
    };
  },

  async listModels(config) {
    const headers = {
      'Authorization': `Bearer ${config.apiKey}`,
    };
    const res = await proxyFetch('https://api.openai.com/v1/models', { headers });
    if (!res.ok) throw new Error(`Failed to list models: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return (data.data || [])
      .map((m) => ({ id: m.id, name: m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async testConnection(config) {
    try {
      const headers = { 'Authorization': `Bearer ${config.apiKey}` };
      const res = await proxyFetch('https://api.openai.com/v1/models', { headers });
      if (res.ok) return { ok: true };
      if (res.status === 401) return { ok: false, error: '401 Unauthorized. Check your API Key.' };
      return { ok: false, error: `${res.status} ${res.statusText}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  buildChatRequest(config, messages, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };

    const body = {
      model: config.model,
      messages,
      stream: options.stream ?? true,
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;

    return { url: 'https://api.openai.com/v1/chat/completions', headers, body };
  },
};

// ---------------------------------------------------------------------------
// Provider: GitHub Models
// ---------------------------------------------------------------------------
const githubModels = {
  getConfig() {
    return {
      id: 'github-models',
      name: 'GitHub Models',
      fields: [
        { key: 'apiKey', label: 'GitHub Token', type: 'password', required: true, placeholder: 'ghp_...' },
      ],
    };
  },

  async listModels(config) {
    const headers = {
      'Authorization': `Bearer ${config.apiKey}`,
    };
    const res = await proxyFetch('https://models.github.ai/api/models', { headers });
    if (!res.ok) throw new Error(`Failed to list models: ${res.status} ${res.statusText}`);
    const data = await res.json();
    // GitHub Models returns an array directly or { value: [...] }
    const models = Array.isArray(data) ? data : (data.value || data.data || []);
    return models
      .map((m) => ({ id: m.name || m.id, name: m.friendly_name || m.name || m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async testConnection(config) {
    try {
      const headers = { 'Authorization': `Bearer ${config.apiKey}` };
      const res = await proxyFetch('https://models.github.ai/api/models', { headers });
      if (res.ok) return { ok: true };
      if (res.status === 401) return { ok: false, error: '401 Unauthorized. Check your GitHub Token.' };
      return { ok: false, error: `${res.status} ${res.statusText}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  buildChatRequest(config, messages, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };

    const body = {
      model: config.model,
      messages,
      stream: options.stream ?? true,
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;

    return { url: 'https://models.github.ai/inference/chat/completions', headers, body };
  },
};

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------
export const PROVIDERS = {
  'ollama-cloud': ollamaCloud,
  'ollama-local': ollamaLocal,
  'openai': openai,
  'github-models': githubModels,
};

// ---------------------------------------------------------------------------
// Active Provider persistence (chrome.storage.local)
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'activeProvider';
const DEFAULT_PROVIDER = 'ollama-cloud';

/**
 * Get the active provider id from chrome.storage.local.
 * Falls back to 'ollama-cloud' if not set or chrome.storage unavailable.
 * @returns {Promise<string>}
 */
export async function getActiveProvider() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || DEFAULT_PROVIDER;
  } catch {
    return DEFAULT_PROVIDER;
  }
}

/**
 * Set the active provider id in chrome.storage.local.
 * @param {string} providerId - One of the PROVIDERS keys
 * @returns {Promise<void>}
 */
export async function setActiveProvider(providerId) {
  if (!PROVIDERS[providerId]) {
    throw new Error(`Unknown provider: ${providerId}. Valid: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: providerId });
}
