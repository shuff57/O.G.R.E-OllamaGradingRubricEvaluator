/**
 * providers.js - Multi-Provider Adapter for O.G.R.E Extension
 * 
 * Supported providers (canonical IDs):
 *   - ollama:         Ollama (cloud or local, determined by api_url)
 *   - openai:         OpenAI API
 *   - anthropic:      Anthropic Claude
 *   - google-gemini:  Google Gemini
 *   - github-models:  GitHub Copilot (api.githubcopilot.com)
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
// Provider: Ollama (unified — cloud or local determined by apiUrl)
// ---------------------------------------------------------------------------
const ollama = {
  getConfig() {
    return {
      id: 'ollama',
      name: 'Ollama',
      fields: [
        { key: 'apiUrl', label: 'API URL', type: 'text', required: false, placeholder: 'http://localhost:11434', default: 'http://localhost:11434' },
        { key: 'apiKey', label: 'API Key (optional)', type: 'password', required: false },
      ],
    };
  },

  async listModels(config) {
    const base = normalizeBaseUrl(config.apiUrl || 'http://localhost:11434');
    const headers = {};
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const res = await proxyFetch(`${base}/api/tags`, { headers });
    if (!res.ok) throw new Error(`Failed to list models: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return (data.models || []).map((m) => ({ id: m.name || m.model, name: m.name || m.model }));
  },

  async testConnection(config) {
    try {
      const base = normalizeBaseUrl(config.apiUrl || 'http://localhost:11434');
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
    const base = normalizeBaseUrl(config.apiUrl || 'http://localhost:11434');
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    // Transform messages to strip Data URL headers from images (Ollama expects raw base64)
    const formattedMessages = messages.map(m => {
      if (m.images && m.images.length > 0) {
        return {
          ...m,
          images: m.images.map(img => img.replace(/^data:image\/[a-z]+;base64,/, ''))
        };
      }
      return m;
    });

    const body = {
      model: config.model,
      messages: formattedMessages,
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

    // Transform messages to OpenAI vision format if images are present
    const formattedMessages = messages.map(m => {
      if (m.images && m.images.length > 0) {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.content },
            ...m.images.map(img => ({ 
              type: 'image_url', 
              image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` } 
            }))
          ]
        };
      }
      // Remove images property if it exists but is empty, or return as is
      const { images, ...rest } = m;
      return rest;
    });

    const body = {
      model: config.model,
      messages: formattedMessages,
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
      name: 'GitHub Copilot',
      fields: [
        { key: 'apiKey', label: 'GitHub Token', type: 'password', required: false, placeholder: 'ghp_...' },
        { key: 'oauthToken', label: 'OAuth Token', type: 'hidden' },
      ],
    };
  },

  async listModels(config) {
    const token = config.oauthToken || config.apiKey;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Copilot-Integration-Id': 'vscode-chat',
    };
    const res = await proxyFetch('https://api.githubcopilot.com/models', { headers });
    if (!res.ok) throw new Error(`Failed to list models: ${res.status} ${res.statusText}`);
    const data = await res.json();
    // Copilot API returns { data: [...] } with OpenAI-style format
    const models = Array.isArray(data) ? data : (data.data || data.value || []);
    return models
      .map((m) => ({ id: m.id || m.name, name: m.id || m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async testConnection(config) {
    try {
      const token = config.oauthToken || config.apiKey;
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Copilot-Integration-Id': 'vscode-chat',
      };
      const res = await proxyFetch('https://api.githubcopilot.com/models', { headers });
      if (res.ok) return { ok: true };
      if (res.status === 401) return { ok: false, error: '401 Unauthorized. Check your GitHub Token or OAuth token.' };
      if (res.status === 403) return { ok: false, error: '403 Forbidden. You may need a GitHub Copilot subscription.' };
      return { ok: false, error: `${res.status} ${res.statusText}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  buildChatRequest(config, messages, options = {}) {
    const token = config.oauthToken || config.apiKey;
    const hasImages = messages.some(m => m.images && m.images.length > 0);
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Copilot-Integration-Id': 'vscode-chat',
    };
    // Add vision header if request contains images
    if (hasImages) {
      headers['Copilot-Vision-Request'] = 'true';
    }

    // Transform messages to OpenAI vision format if images are present
    const formattedMessages = messages.map(m => {
      if (m.images && m.images.length > 0) {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.content },
            ...m.images.map(img => ({ 
              type: 'image_url', 
              image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` } 
            }))
          ]
        };
      }
      // Remove images property if it exists but is empty, or return as is
      const { images, ...rest } = m;
      return rest;
    });

    const body = {
      model: config.model,
      messages: formattedMessages,
      stream: options.stream ?? true,
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;

    return { url: 'https://api.githubcopilot.com/chat/completions', headers, body };
  },
};

// ---------------------------------------------------------------------------
// Provider: Anthropic Claude
// ---------------------------------------------------------------------------
const anthropic = {
  getConfig() {
    return {
      id: 'anthropic',
      name: 'Anthropic Claude',
      fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-ant-...' },
      ],
    };
  },

  async listModels(config) {
    // Anthropic doesn't have a models list endpoint, return hardcoded latest models
    return [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4.5 (Latest)' },
      { id: 'claude-opus-4-20250220', name: 'Claude Opus 4' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4.5 (Latest)' },
      { id: 'claude-sonnet-4-20250220', name: 'Claude Sonnet 4' },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    ];
  },

  async testConnection(config) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      };
      const body = {
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      };
      const res = await proxyFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
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
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    };

    // Anthropic uses different message format - extract system messages
    let systemPrompt = '';
    const anthropicMessages = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        if (msg.images && msg.images.length > 0) {
          // Anthropic vision format
          const content = [{ type: 'text', text: msg.content }];
          for (const img of msg.images) {
            const base64Data = img.startsWith('data:') ? img.split(',')[1] : img;
            const mediaType = img.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
            content.push({
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            });
          }
          anthropicMessages.push({ role: msg.role, content });
        } else {
          anthropicMessages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    const body = {
      model: config.model,
      messages: anthropicMessages,
      max_tokens: options.max_tokens || 4096,
      stream: options.stream ?? true,
    };
    if (systemPrompt) body.system = systemPrompt;
    if (options.temperature !== undefined) body.temperature = options.temperature;

    return { url: 'https://api.anthropic.com/v1/messages', headers, body };
  },
};

// ---------------------------------------------------------------------------
// Provider: Google Gemini
// ---------------------------------------------------------------------------
const googleGemini = {
  getConfig() {
    return {
      id: 'google-gemini',
      name: 'Google Gemini',
      fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: false, placeholder: 'AIza...' },
        { key: 'oauthToken', label: 'OAuth Token', type: 'hidden' },
      ],
    };
  },

  async listModels(config) {
    try {
      let url, fetchOptions;
      if (config.oauthToken) {
        url = 'https://generativelanguage.googleapis.com/v1beta/models';
        fetchOptions = { headers: { 'Authorization': `Bearer ${config.oauthToken}` } };
      } else {
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.apiKey}`;
        fetchOptions = {};
      }
      const res = await proxyFetch(url, fetchOptions);
      if (!res.ok) throw new Error(`Failed to list models: ${res.status}`);
      const data = await res.json();
      return (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => {
          const id = m.name.replace('models/', '');
          return { id, name: id };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      // Fallback to hardcoded models if API call fails
      return [
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)' },
        { id: 'gemini-exp-1206', name: 'Gemini Experimental 1206' },
        { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
        { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash-8B' },
      ];
    }
  },

  async testConnection(config) {
    try {
      let url, fetchOptions;
      if (config.oauthToken) {
        url = 'https://generativelanguage.googleapis.com/v1beta/models';
        fetchOptions = { headers: { 'Authorization': `Bearer ${config.oauthToken}` } };
      } else {
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.apiKey}`;
        fetchOptions = {};
      }
      const res = await proxyFetch(url, fetchOptions);
      if (res.ok) return { ok: true };
      if (res.status === 401 || res.status === 403) return { ok: false, error: '401/403 Unauthorized. Check your API Key or OAuth token.' };
      return { ok: false, error: `${res.status} ${res.statusText}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  buildChatRequest(config, messages, options = {}) {
    const headers = { 'Content-Type': 'application/json' };

    // If using OAuth token, authenticate via Bearer header instead of query param
    if (config.oauthToken) {
      headers['Authorization'] = `Bearer ${config.oauthToken}`;
    }

    // Gemini uses 'user' and 'model' roles, convert messages
    const geminiMessages = [];
    let systemInstruction = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
      } else {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        if (msg.images && msg.images.length > 0) {
          // Gemini vision format
          const parts = [{ text: msg.content }];
          for (const img of msg.images) {
            const base64Data = img.startsWith('data:') ? img.split(',')[1] : img;
            const mimeType = img.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
            parts.push({
              inline_data: { mime_type: mimeType, data: base64Data },
            });
          }
          geminiMessages.push({ role, parts });
        } else {
          geminiMessages.push({ role, parts: [{ text: msg.content }] });
        }
      }
    }

    const body = {
      contents: geminiMessages,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.max_tokens,
      },
    };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

    const modelId = config.model || 'gemini-1.5-pro';
    const action = options.stream ? 'streamGenerateContent' : 'generateContent';
    let url;
    if (config.oauthToken) {
      // OAuth: no key param, use Bearer header (set above)
      url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:${action}${options.stream ? '?alt=sse' : ''}`;
    } else {
      // API key: append key as query param (existing behavior)
      const streamParam = options.stream ? '?alt=sse' : '';
      url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:${action}${streamParam}&key=${config.apiKey}`;
    }

    return { url, headers, body };
  },
};

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------
export const PROVIDERS = {
  'ollama': ollama,
  'openai': openai,
  'anthropic': anthropic,
  'google-gemini': googleGemini,
  'github-models': githubModels,
};

// ---------------------------------------------------------------------------
// Active Provider persistence (chrome.storage.local)
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'activeProvider';
const DEFAULT_PROVIDER = 'ollama';

/**
 * Get the active provider id from chrome.storage.local.
 * Falls back to 'ollama' if not set or chrome.storage unavailable.
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
